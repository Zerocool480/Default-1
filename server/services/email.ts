import nodemailer from 'nodemailer'

function createTransport() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user, pass },
  })
}

export async function sendLineupReminder(emails: string[], week: number, appUrl: string): Promise<{ sent: number; skipped: boolean }> {
  const transport = createTransport()
  if (!transport) {
    console.log(`[email] SMTP not configured — would have sent lineup reminder for week ${week} to ${emails.length} members`)
    return { sent: 0, skipped: true }
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const lockDay = 'Thursday'

  let sent = 0
  // Send in batches of 50 to avoid overwhelming SMTP
  const batchSize = 50
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(to =>
      transport.sendMail({
        from: `Great Awakening Fantasy League <${from}>`,
        to,
        subject: `⏰ Week ${week} lineup due ${lockDay} — GAFL`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#f0f0f0;padding:24px;border-radius:12px">
            <h2 style="color:#D4AF37;margin:0 0 8px">Great Awakening Fantasy League</h2>
            <p style="color:#888;margin:0 0 20px;font-size:14px">Week ${week} Lineup Reminder</p>
            <p style="margin:0 0 16px">Don't forget to set your Week ${week} lineup before ${lockDay} night kickoff!</p>
            <p style="margin:0 0 16px;font-size:13px;color:#888">
              Remember — once you use a player this segment, they're locked until the next segment starts.
              Choose wisely.
            </p>
            <a href="${appUrl}/lineup" style="display:inline-block;background:#D4AF37;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-bottom:20px">
              Set My Lineup
            </a>
            <p style="font-size:11px;color:#555;margin:0">
              You're receiving this because you registered for Great Awakening Fantasy League.
            </p>
          </div>
        `,
      }).catch(err => console.error(`Failed to send to ${to}:`, err))
    ))
    sent += batch.length
  }

  return { sent, skipped: false }
}
