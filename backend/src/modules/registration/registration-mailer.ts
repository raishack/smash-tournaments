import nodemailer from "nodemailer";

export interface RegistrationMailer {
  readonly configured: boolean;
  send(email: string, tournamentTitle: string, verificationUrl: string, notice?: string): Promise<void>;
}

export class SmtpRegistrationMailer implements RegistrationMailer {
  private readonly transport;
  private readonly from: string;
  readonly configured: boolean;
  constructor(env = process.env) {
    this.from = env.REGISTRATION_MAIL_FROM?.trim() || "";
    const host = env.REGISTRATION_SMTP_HOST?.trim();
    const port = Number(env.REGISTRATION_SMTP_PORT || 587);
    const secure = env.REGISTRATION_SMTP_SECURE === "true" || port === 465;
    this.configured = Boolean(host && this.from && Number.isInteger(port) && port > 0 && port <= 65535);
    this.transport = nodemailer.createTransport({
      host, port, secure, requireTLS: !secure,
      auth: env.REGISTRATION_SMTP_USER ? { user: env.REGISTRATION_SMTP_USER, pass: env.REGISTRATION_SMTP_PASSWORD } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
  }
  async send(email: string, tournamentTitle: string, verificationUrl: string, notice?: string): Promise<void> {
    if (!this.configured) throw new Error("Correo de inscripciones sin configurar");
    await this.transport.sendMail({
      from: this.from, to: { name: "", address: email },
      subject: notice ? "Tu inscripción · Tournament Platform" : "Confirma tu inscripción · Tournament Platform",
      text: notice ? `${tournamentTitle}\n\n${notice}\n\n${verificationUrl}` : `Has solicitado inscribirte en ${tournamentTitle}.\n\nAbre este enlace y pulsa «Confirmar inscripción» para verificar tu correo y completar el registro:\n${verificationUrl}\n\nEl enlace caduca en 24 horas. La plaza se asigna al confirmar, si la inscripción sigue abierta y quedan plazas.\n\nSi no solicitaste esta inscripción, ignora este mensaje. No se añadirá ningún participante sin confirmar.`,
    });
  }
}
