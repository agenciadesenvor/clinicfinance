require 'webrick'
server = WEBrick::HTTPServer.new(
  Port: 3456,
  DocumentRoot: File.dirname(__FILE__),
  AccessLog: [],
  Logger: WEBrick::Log.new('/dev/null')
)
trap('INT') { server.shutdown }
server.start
