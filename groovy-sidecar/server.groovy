@Grab('io.javalin:javalin:6.1.3')
@Grab('com.fasterxml.jackson.core:jackson-databind:2.17.0')
@Grab('org.slf4j:slf4j-simple:2.0.13')

import io.javalin.Javalin
import groovy.json.JsonSlurper
import groovy.json.JsonBuilder
import groovy.json.JsonOutput
import groovy.xml.XmlSlurper
import groovy.xml.MarkupBuilder

def app = Javalin.create().start(8090)

app.post("/execute") { ctx ->
    def body = new JsonSlurper().parseText(ctx.body())
    def script = body.script as String
    def input = body.input as String
    def timeout = (body.timeout ?: 30000) as Long

    def result = executeScript(script, input, timeout)
    ctx.json(result)
}

app.get("/health") { ctx ->
    ctx.result("OK")
}

def executeScript(String script, String input, Long timeoutMs) {
    def logs = []
    def startTime = System.currentTimeMillis()

    try {
        // Create a sandboxed binding
        def binding = new Binding()
        binding.setVariable("input", input)

        // Provide XML parsing helper
        binding.setVariable("parseXML", { String xml ->
            new XmlSlurper().parseText(xml)
        })

        // Inject 'source' as parsed XML if input looks like XML
        if (input?.trim()?.startsWith("<")) {
            try {
                binding.setVariable("source", new XmlSlurper().parseText(input))
            } catch (Exception ignored) {
                // Not valid XML — leave source unset
            }
        }

        // Inject a stub 'transaction' object for legacy prolog scripts
        // that reference JTUtil.getGlobalData(transaction, key) etc.
        def transactionStub = new Expando()
        transactionStub.metaClass.methodMissing = { String name, args ->
            logs.add("[WARN] transaction.${name}() called — stub, returns null")
            return null
        }
        binding.setVariable("transaction", transactionStub)

        // Inject stub JTUtil / JTLookupUtil / JTV3Utils
        def createPlatformStub = { String className ->
            def stub = new Expando()
            stub.metaClass.static.propertyMissing = { String name -> null }
            stub.metaClass.static.methodMissing = { String name, args ->
                logs.add("[WARN] ${className}.${name}() called — stub, returns null")
                return null
            }
            return stub
        }

        binding.setVariable("JTUtil", createPlatformStub("JTUtil"))
        binding.setVariable("JTLookupUtil", createPlatformStub("JTLookupUtil"))
        binding.setVariable("JTV3Utils", createPlatformStub("JTV3Utils"))

        // Capture println output
        def outputCapture = new StringWriter()
        def printWriter = new PrintWriter(outputCapture)
        binding.setVariable("out", printWriter)

        def shell = new GroovyShell(binding)

        // Execute with timeout
        def executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        def future = executor.submit({
            shell.evaluate(script)
        } as java.util.concurrent.Callable)

        def output
        try {
            output = future.get(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
        } finally {
            executor.shutdownNow()
        }

        printWriter.flush()
        def capturedOutput = outputCapture.toString()
        if (capturedOutput) {
            logs.addAll(capturedOutput.split("\n").toList())
        }

        return [
            output: output?.toString() ?: "",
            error: null,
            logs: logs,
            durationMs: System.currentTimeMillis() - startTime
        ]
    } catch (java.util.concurrent.TimeoutException e) {
        return [
            output: "",
            error: "Script execution timed out after ${timeoutMs}ms".toString(),
            logs: logs,
            durationMs: System.currentTimeMillis() - startTime
        ]
    } catch (java.util.concurrent.ExecutionException e) {
        def cause = e.cause ?: e
        return [
            output: "",
            error: cause.message ?: cause.toString(),
            logs: logs,
            durationMs: System.currentTimeMillis() - startTime
        ]
    } catch (Exception e) {
        return [
            output: "",
            error: e.message ?: e.toString(),
            logs: logs,
            durationMs: System.currentTimeMillis() - startTime
        ]
    }
}

println "Groovy sidecar running on http://localhost:8090"
