import Foundation
import React
import RNSentry
import Sentry

private final class NoDiagnosticRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

// A dedicated URLSession/URLProtocol is a public Sentry Options API. It intercepts native SDK
// requests AFTER envelope creation, gzip and cache replay. The original request is never sent.
final class PrivateDiagnosticProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        if PrivateDiagnosticsState.shared.accepts(request),
           let raw = PrivateDiagnosticsPolicy.readBody(request),
           let body = PrivateDiagnosticsPolicy.decode(raw, encoding: request.value(forHTTPHeaderField: "Content-Encoding")),
           let events = PrivateDiagnosticsPolicy.events(body, release: PrivateDiagnosticsConfig.release, environment: PrivateDiagnosticsConfig.environment) {
            PrivateDiagnosticsState.shared.collect(events, epoch: request.value(forHTTPHeaderField: "X-Private-Diagnostics-Epoch"))
        }
        // Acknowledge locally, including rejected input. Never let the SDK retry unsafe envelopes.
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:]) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class PrivateDiagnosticsState {
    static let shared = PrivateDiagnosticsState()
    private let lock = NSRecursiveLock()
    private let defaults = UserDefaults.standard
    private let keyName = "privateDiagnostics.v1.session"
    private let configName = "privateDiagnostics.v1.config"
    private var storageReady = false
    private var sessionKey: String?
    private var activeUntil: TimeInterval = 0
    private var uptimeUntil: TimeInterval = 0
    private var generation: UInt = 0
    private var sdkEpoch: String?
    private var pending: [[String: Any]] = []
    private var task: URLSessionDataTask?
    private var expiryWork: DispatchWorkItem?
    private let redirects = NoDiagnosticRedirects()
    private lazy var sender: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCredentialStorage = nil
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.connectionProxyDictionary = [:]
        config.timeoutIntervalForRequest = 10; config.timeoutIntervalForResource = 15
        config.httpAdditionalHeaders = ["User-Agent": "Hittumst-private-diagnostics/1", "Accept-Language": "en"]
        return URLSession(configuration: config, delegate: redirects, delegateQueue: nil)
    }()
    let directory: URL
    var sdkDirectory: URL { directory.appendingPathComponent("native-sdk", isDirectory: true) }
    private var queueFile: URL { directory.appendingPathComponent("projected-events.json") }
    var configured: Bool {
        lock.lock(); defer { lock.unlock() }
        guard storageReady, PrivateDiagnosticsConfig.enabled,
              ["staging", "production"].contains(PrivateDiagnosticsConfig.environment),
              PrivateDiagnosticsConfig.release.range(of: "^[A-Za-z0-9._-]{1,100}$", options: .regularExpression) != nil,
              let dsn = URLComponents(string: PrivateDiagnosticsConfig.dsn), dsn.scheme == "https", dsn.port == nil,
              let host = dsn.host, host.range(of: "^[a-z0-9-]+[.]ingest[.]de[.]sentry[.]io$", options: .regularExpression) != nil,
              let user = dsn.user, user.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              dsn.password == nil, dsn.query == nil, dsn.fragment == nil,
              dsn.path.range(of: "^/[0-9]+$", options: .regularExpression) != nil else { return false }
        return true
    }
    private var fingerprint: String { PrivateDiagnosticsConfig.dsn + "|" + PrivateDiagnosticsConfig.release + "|" + PrivateDiagnosticsConfig.environment }
    private init() {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PrivateNativeDiagnosticsV1", isDirectory: true)
        storageReady = protectDirectory(directory) && protectDirectory(sdkDirectory)
        sessionKey = defaults.string(forKey: keyName)
        if !configured || defaults.string(forKey: configName) != fingerprint || !validKey(sessionKey) {
            sessionKey = nil; defaults.removeObject(forKey: keyName)
            purgeFiles()
        } else if let data = try? Data(contentsOf: queueFile), data.count <= 65_536,
                  let stored = PrivateDiagnosticsPolicy.object(data), stored["session"] as? String == sessionKey,
                  let entries = stored["events"] as? [[String: Any]], entries.count <= 20 {
            pending = entries.compactMap { PrivateDiagnosticsPolicy.event($0, release: PrivateDiagnosticsConfig.release, environment: PrivateDiagnosticsConfig.environment) }
        }
        // Persisted session identity is never permission to transmit: every launch starts closed.
        defaults.set(fingerprint, forKey: configName)
    }
    private func validKey(_ value: String?) -> Bool {
        guard let value else { return false }
        return value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }
    private func protectDirectory(_ url: URL) -> Bool {
        do {
            let protection = FileProtectionType.completeUntilFirstUserAuthentication
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.protectionKey: protection])
            try FileManager.default.setAttributes([.protectionKey: protection], ofItemAtPath: url.path)
            var protectedURL = url
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try protectedURL.setResourceValues(values)
            let actual = try protectedURL.resourceValues(forKeys: [.isExcludedFromBackupKey, .isSymbolicLinkKey, .isDirectoryKey])
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            return actual.isExcludedFromBackup == true && actual.isDirectory == true && actual.isSymbolicLink != true &&
                (attributes[.protectionKey] as? FileProtectionType) == protection
        } catch { return false }
    }
    var hasSession: Bool { lock.lock(); defer { lock.unlock() }; return sessionKey != nil }
    func purgeFiles() {
        lock.lock(); defer { lock.unlock() }
        // These are fixed app-owned subpaths, never caller-controlled filesystem paths.
        do {
            for url in [sdkDirectory, queueFile] where FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
            storageReady = protectDirectory(directory) && protectDirectory(sdkDirectory)
        } catch { storageReady = false }
    }
    private func saveQueue() {
        guard let sessionKey, let data = PrivateDiagnosticsPolicy.json(["session": sessionKey, "events": pending]) else {
            try? FileManager.default.removeItem(at: queueFile); return
        }
        try? data.write(to: queueFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    private var leaseLive: Bool {
        configured && sessionKey != nil && Date().timeIntervalSince1970 < activeUntil && ProcessInfo.processInfo.systemUptime < uptimeUntil
    }
    func accepts(_ request: URLRequest) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard let sdkEpoch, request.value(forHTTPHeaderField: "X-Private-Diagnostics-Epoch") == sdkEpoch, configured, request.httpMethod == "POST", let url = request.url, let endpoint = endpoint,
              url.scheme == endpoint.scheme, url.host == endpoint.host, url.port == nil,
              url.user == nil, url.password == nil, url.path == endpoint.path, url.query == nil, url.fragment == nil,
              request.value(forHTTPHeaderField: "Content-Type")?.split(separator: ";").first?.lowercased() == "application/x-sentry-envelope" else { return false }
        return true
    }
    private var endpoint: URL? {
        guard let dsn = URLComponents(string: PrivateDiagnosticsConfig.dsn), let host = dsn.host else { return nil }
        return URL(string: "https://" + host + "/api" + dsn.path + "/envelope/")
    }
    // Returns true when the native SDK must be closed/purged/restarted for a new session.
    func updateSession(_ next: String?, expiresAtMs: Double) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Date().timeIntervalSince1970
        expiryWork?.cancel()
        let valid = configured && validKey(next) && expiresAtMs.isFinite && expiresAtMs > now * 1000 && expiresAtMs <= (now + 120.5) * 1000
        let key = valid ? next : nil
        let changed = key != sessionKey || key == nil
        if changed {
            generation &+= 1; sdkEpoch = nil; task?.cancel(); task = nil; pending.removeAll()
            sessionKey = key; defaults.set(key, forKey: keyName)
            saveQueue()
        }
        activeUntil = valid ? expiresAtMs / 1000 : 0
        uptimeUntil = valid ? ProcessInfo.processInfo.systemUptime + min(120, activeUntil - now) : 0
        if valid {
            let token = generation
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.lock.lock()
                var expiredGeneration: UInt?
                if token == self.generation && !self.leaseLive {
                    _ = self.updateSession(nil, expiresAtMs: 0)
                    expiredGeneration = self.generation
                }
                self.lock.unlock()
                if let expiredGeneration {
                    DispatchQueue.main.async {
                        if self.isGeneration(expiredGeneration) { PrivateDiagnosticsBootstrap.sessionChanged() }
                    }
                }
            }
            expiryWork = work
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + min(120, max(0, activeUntil - now)), execute: work)
        }
        if !changed { sendNext() }
        return changed
    }
    func isGeneration(_ value: UInt) -> Bool { lock.lock(); defer { lock.unlock() }; return generation == value }
    func beginSDKEpoch() -> String { lock.lock(); defer { lock.unlock() }; let epoch = UUID().uuidString; sdkEpoch = epoch; return epoch }
    func collect(_ events: [[String: Any]], epoch: String?) {
        lock.lock(); defer { lock.unlock() }
        guard configured, sessionKey != nil, let epoch, epoch == sdkEpoch else { return }
        for event in events {
            guard let id = event["event_id"] as? String, !pending.contains(where: { $0["event_id"] as? String == id }) else { continue }
            if pending.count == 20 { pending.removeFirst() }
            pending.append(event)
        }
        saveQueue(); sendNext()
    }
    func flushProjected() { lock.lock(); defer { lock.unlock() }; sendNext() }
    private func sendNext() {
        guard task == nil, leaseLive, let event = pending.first, let body = PrivateDiagnosticsPolicy.envelope(event),
              let endpoint, let key = URLComponents(string: PrivateDiagnosticsConfig.dsn)?.user else { return }
        let currentGeneration = generation
        let remaining = min(activeUntil - Date().timeIntervalSince1970, uptimeUntil - ProcessInfo.processInfo.systemUptime)
        guard remaining > 0 else { return }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: min(10, remaining))
        request.httpMethod = "POST"; request.httpBody = body; request.httpShouldHandleCookies = false
        request.allHTTPHeaderFields = ["Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": "Sentry sentry_version=7,sentry_key=" + key,
                                      "User-Agent": "Hittumst-private-diagnostics/1", "Accept-Language": "en", "Accept-Encoding": "identity"]
        let currentTask = sender.dataTask(with: request) { [weak self] _, response, error in
            guard let self else { return }
            self.lock.lock(); defer { self.lock.unlock() }
            guard currentGeneration == self.generation else { return }
            self.task = nil
            guard self.leaseLive else { self.pending.removeAll(); self.saveQueue(); return }
            if error == nil, let status = (response as? HTTPURLResponse)?.statusCode, (200..<500).contains(status), status != 408, status != 429 {
                self.pending.removeAll { $0["event_id"] as? String == event["event_id"] as? String }
                self.saveQueue(); self.sendNext()
            }
            // Offline/5xx keeps only the projected payload; next live session validation retries.
        }
        task = currentTask
        currentTask.resume()
    }
}

@objc final class PrivateDiagnosticsBootstrap: NSObject {
    private static var started = false
    @objc static func start() {
        let state = PrivateDiagnosticsState.shared
        guard !started, state.configured, state.hasSession else { return }
        started = true
        let sessionConfig = URLSessionConfiguration.ephemeral
        sessionConfig.protocolClasses = [PrivateDiagnosticProtocol.self]
        sessionConfig.httpAdditionalHeaders = ["X-Private-Diagnostics-Epoch": state.beginSDKEpoch()]
        sessionConfig.httpCookieStorage = nil; sessionConfig.httpShouldSetCookies = false; sessionConfig.urlCredentialStorage = nil
        sessionConfig.urlCache = nil
        RNSentrySDK.start { options in
            options.enabled = true; options.debug = false; options.enableCrashHandler = true
            options.dsn = PrivateDiagnosticsConfig.dsn
            options.releaseName = PrivateDiagnosticsConfig.release; options.environment = PrivateDiagnosticsConfig.environment
            options.cacheDirectoryPath = state.sdkDirectory.path
            options.urlSession = URLSession(configuration: sessionConfig)
            options.sendDefaultPii = false; options.sendClientReports = false
            options.enableAutoSessionTracking = false; options.enableSwizzling = false
            options.enableAutoBreadcrumbTracking = false; options.maxBreadcrumbs = 0
            options.beforeBreadcrumb = { _ in nil }
            options.enableLogs = false; options.enableMetrics = false
            options.enableSpotlight = false; options.enableAutoPerformanceTracing = false
            options.tracesSampleRate = 0; options.tracesSampler = nil; options.configureProfiling = nil
            options.enableAppHangTracking = false; options.enableWatchdogTerminationTracking = false
            options.enableMemoryIntrospection = false
            options.attachScreenshot = false; options.attachViewHierarchy = false
            options.sessionReplay.sessionSampleRate = 0; options.sessionReplay.onErrorSampleRate = 0
        }
    }
    static func sessionChanged() {
        if started { SentrySDK.close(); started = false }
        PrivateDiagnosticsState.shared.purgeFiles()
        start()
        PrivateDiagnosticsState.shared.flushProjected()
    }
}

@objc(PrivateNativeDiagnostics) final class PrivateNativeDiagnostics: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool { true }
    @objc func constantsToExport() -> [AnyHashable: Any] {
        ["configured": PrivateDiagnosticsState.shared.configured, "dsn": PrivateDiagnosticsConfig.dsn,
         "release": PrivateDiagnosticsConfig.release, "environment": PrivateDiagnosticsConfig.environment]
    }
    @objc(setSession:expiresAtMs:resolver:rejecter:)
    func setSession(_ key: String?, expiresAtMs: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            let changed = PrivateDiagnosticsState.shared.updateSession(key, expiresAtMs: expiresAtMs)
            if changed { PrivateDiagnosticsBootstrap.sessionChanged() }
            resolve(nil)
        }
    }
}
