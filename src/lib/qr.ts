import QRCode from 'qrcode';

/**
 * The QR code of an invite link, as SVG markup to place in the page.
 *
 * Safe to inject: the markup comes from the library and holds only the <svg> frame and the
 * <path>s that draw the squares. The text being encoded never appears in it as text, only as
 * the shape of the squares, and the colors are fixed here.
 */
export async function inviteQrSvg(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    // Dark squares on a light ground (a light code on the dark app would not scan on most
    // phones), inside the library's default 4-square quiet zone that cameras need.
    color: { dark: '#0E0E10', light: '#FFFFFF' },
  });
  return svg.trim();
}
