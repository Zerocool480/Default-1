import { useEffect, useRef } from 'react'

interface QrScannerProps {
  onScan: (code: string) => void
  active: boolean
}

export default function QrScanner({ onScan, active }: QrScannerProps) {
  const scannerRef = useRef<any>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!active || mountedRef.current) return

    import('html5-qrcode').then(({ Html5QrcodeScanner, Html5QrcodeScanType }) => {
      if (!active || mountedRef.current) return
      mountedRef.current = true

      const scanner = new Html5QrcodeScanner(
        'gafl-qr-reader',
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          showTorchButtonIfSupported: true,
        },
        false
      )

      scannerRef.current = scanner

      scanner.render(
        (decodedText: string) => {
          scanner.clear().catch(() => {})
          mountedRef.current = false
          scannerRef.current = null
          onScan(decodedText)
        },
        () => {}
      )
    }).catch(console.error)

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
        scannerRef.current = null
        mountedRef.current = false
      }
    }
  }, [active, onScan])

  if (!active) return null

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-black">
      <div id="gafl-qr-reader" className="w-full" />
    </div>
  )
}
