import { connect } from "net"
import { connect as connectTls } from "tls"

type SmtpArgs = {
  host: string
  port: number
  user?: string
  password?: string
  from: string
  to: string
  subject: string
  text: string
}

function command(socket: NodeJS.ReadWriteStream, line: string) {
  socket.write(`${line}\r\n`)
}

/** Minimal SMTP client for a magic-link message. AUTH LOGIN when a user is set. */
export function sendSmtp(args: SmtpArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const secure = args.port === 465
    const socket = secure
      ? connectTls({ host: args.host, port: args.port, servername: args.host })
      : connect({ host: args.host, port: args.port })
    let buffer = ""
    let step = 0
    const fail = (error: Error) => {
      socket.end()
      reject(error)
    }
    socket.on("error", fail)
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      if (!buffer.includes("\n")) return
      const lines = buffer.split(/\r?\n/).filter(Boolean)
      buffer = ""
      const last = lines[lines.length - 1] || ""
      if (!/^[23]/.test(last) && step > 0) {
        fail(new Error(`SMTP rejected the message: ${last}`))
        return
      }
      const from = args.from.match(/<([^>]+)>/)?.[1] || args.from
      const steps = [
        () => command(socket, `EHLO jobscanner.local`),
        () => {
          if (!args.user) {
            step += 1
            command(socket, `MAIL FROM:<${from}>`)
            return
          }
          command(socket, "AUTH LOGIN")
        },
        () => command(socket, Buffer.from(args.user || "").toString("base64")),
        () => command(socket, Buffer.from(args.password || "").toString("base64")),
        () => command(socket, `MAIL FROM:<${from}>`),
        () => command(socket, `RCPT TO:<${args.to}>`),
        () => command(socket, "DATA"),
        () => {
          const body = [
            `From: ${args.from}`,
            `To: ${args.to}`,
            `Subject: ${args.subject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=utf-8",
            "",
            args.text,
            ".",
          ].join("\r\n")
          command(socket, body)
        },
        () => {
          command(socket, "QUIT")
          socket.end()
          resolve()
        },
      ]
      const run = steps[step]
      step += 1
      if (run) run()
    })
  })
}
