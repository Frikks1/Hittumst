import Foundation

@main struct PolicyTests {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    static func main() throws {
        let directory = URL(fileURLWithPath: CommandLine.arguments[1])
        let raw = try Data(contentsOf: directory.appendingPathComponent("hostile-envelope.txt"))
        let events = PrivateDiagnosticsPolicy.events(raw, release: "r1", environment: "staging")!
        require(events.count == 1, "attachments and replay must be discarded")
        let projected = PrivateDiagnosticsPolicy.envelope(events[0])!
        let output = String(data: projected, encoding: .utf8)!
        require(!output.lowercased().contains("private"), "private content escaped")
        require(!output.contains("11111111111111111111111111111111"), "untrusted event id escaped")
        require(output.contains("NativeError") && output.contains("details withheld"), "minimal crash count missing")
        require(!output.contains("latitude") && !output.contains("user") && !output.contains("attachment"), "metadata escaped")
        let gzipText = try String(contentsOf: directory.appendingPathComponent("hostile-envelope.gzip.base64"), encoding: .utf8)
        let gzip = Data(base64Encoded: gzipText)!
        require(PrivateDiagnosticsPolicy.decode(gzip, encoding: "gzip") == raw, "bounded gzip decode failed")
        require(PrivateDiagnosticsPolicy.decode(gzip + Data([0]), encoding: "gzip") == nil, "trailing gzip bytes accepted")
        require(PrivateDiagnosticsPolicy.decode(Data(gzip.dropLast(3)), encoding: "gzip") == nil, "truncated gzip accepted")
        require(PrivateDiagnosticsPolicy.decode(raw, encoding: "br") == nil, "unknown encoding accepted")
        let bomb = Data(base64Encoded: try String(contentsOf: directory.appendingPathComponent("oversized.gzip.base64"), encoding: .utf8))!
        require(PrivateDiagnosticsPolicy.decode(bomb, encoding: "gzip") == nil, "compression bomb accepted")
        require(PrivateDiagnosticsPolicy.events(Data("{}\n{\"type\":\"event\",\"length\":true}\n{}\n".utf8), release: "r1", environment: "staging") == nil, "boolean item length accepted")
        require(PrivateDiagnosticsPolicy.events(Data("multipart-private".utf8), release: "r1", environment: "staging") == nil, "multipart accepted")
        require(PrivateDiagnosticsPolicy.events(Data(raw.dropLast(4)), release: "r1", environment: "staging") == nil, "truncated envelope accepted")
        print("Private iOS diagnostic policy: 12 checks passed")
    }
}
