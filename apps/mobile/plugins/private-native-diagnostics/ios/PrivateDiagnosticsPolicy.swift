import Foundation
import CoreFoundation
import zlib

// Final HTTP boundary. No original header, event field or attachment is forwarded.
enum PrivateDiagnosticsPolicy {
    static let maximumBytes = 1_048_576
    static func decode(_ body: Data, encoding: String?) -> Data? {
        guard body.count <= maximumBytes else { return nil }
        guard let encoding, !encoding.isEmpty, encoding.lowercased() != "identity" else { return body }
        guard encoding.lowercased() == "gzip" else { return nil }
        var stream = z_stream()
        guard inflateInit2_(&stream, 15 + 16, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else { return nil }
        defer { inflateEnd(&stream) }
        var output = Data(count: maximumBytes + 1)
        let result: Int32 = body.withUnsafeBytes { input in
            output.withUnsafeMutableBytes { destination in
                stream.next_in = UnsafeMutablePointer<Bytef>(mutating: input.bindMemory(to: Bytef.self).baseAddress)
                stream.avail_in = uInt(body.count)
                stream.next_out = destination.bindMemory(to: Bytef.self).baseAddress
                stream.avail_out = uInt(maximumBytes + 1)
                return inflate(&stream, Z_FINISH)
            }
        }
        guard result == Z_STREAM_END, stream.avail_in == 0, stream.total_out <= maximumBytes else { return nil }
        output.count = Int(stream.total_out)
        return output
    }

    static func readBody(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body.count <= maximumBytes ? body : nil }
        guard let input = request.httpBodyStream else { return nil }
        input.open()
        defer { input.close() }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 8192)
        while true {
            let count = input.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }
            if count == 0 { break }
            guard result.count + count <= maximumBytes else { return nil }
            result.append(buffer, count: count)
        }
        return result
    }

    static func json(_ value: Any) -> Data? {
        try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    }
    static func object(_ data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    static func validID(_ value: Any?) -> String? {
        guard let value = value as? String, value.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil else { return nil }
        return value
    }

    // Inputs may contain hostile native metadata. Only an event ID is retained; even exception
    // names and native stack addresses are withheld. This intentionally provides crash counts.
    static func event(_ input: [String: Any], release: String, environment: String) -> [String: Any]? {
        guard input["type"] == nil || input["type"] is NSNull,
              let exception = input["exception"] as? [String: Any],
              let values = exception["values"] as? [[String: Any]], !values.isEmpty else { return nil }
        let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        return ["event_id": id, "platform": "native", "level": "error", "release": release, "environment": environment,
                "exception": ["values": [["type": "NativeError", "value": "Native application error (details withheld)",
                    "mechanism": ["type": "generic", "handled": false]]]]]
    }

    static func events(_ data: Data, release: String, environment: String) -> [[String: Any]]? {
        guard data.count <= maximumBytes else { return nil }
        let bytes = [UInt8](data)
        var offset = 0
        func line() -> Data? {
            guard offset < bytes.count, let end = bytes[offset...].firstIndex(of: 10) else { return nil }
            defer { offset = end + 1 }
            return Data(bytes[offset..<end])
        }
        guard let header = line(), object(header) != nil else { return nil }
        var result: [[String: Any]] = []
        var items = 0
        while offset < bytes.count {
            items += 1
            guard items <= 100, let itemLine = line(), let item = object(itemLine), let type = item["type"] as? String else { return nil }
            let payload: Data
            if let rawLength = item["length"] {
                guard let number = rawLength as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
                    number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
                    number.doubleValue >= 0, number.doubleValue <= Double(maximumBytes) else { return nil }
                let length = number.intValue
                guard offset + length <= bytes.count else { return nil }
                payload = Data(bytes[offset..<(offset + length)])
                offset += length
                if offset < bytes.count { guard bytes[offset] == 10 else { return nil }; offset += 1 }
            } else {
                guard let value = line() else { return nil }
                payload = value
            }
            // Every non-event item, including minidump, attachment, replay, profile, sessions,
            // transactions, logs and future unknown types, is deliberately discarded.
            if type == "event", let input = object(payload), let projected = event(input, release: release, environment: environment) {
                result.append(projected)
                guard result.count <= 20 else { return nil }
            }
        }
        return result
    }

    static func envelope(_ event: [String: Any]) -> Data? {
        guard let id = validID(event["event_id"]), let payload = json(event), let header = json(["event_id": id]),
              let item = json(["type": "event", "length": payload.count]) else { return nil }
        var result = header
        result.append(10); result.append(item); result.append(10); result.append(payload); result.append(10)
        return result
    }
}
