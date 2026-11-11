// Call and WhatsApp links. Ugandan numbers typed as 07xx are turned into the +256 form WhatsApp needs.

export function intlDigits(phone: string | undefined): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '256' + d.slice(1);
  else if (d.length === 9 && /^[37]/.test(d)) d = '256' + d;
  return d;
}

export function telLink(phone: string | undefined): string {
  const d = intlDigits(phone);
  return d ? `tel:+${d}` : '#';
}

/** Opens a WhatsApp chat with the message ready to send; the person presses Send themselves. */
export function waLink(phone: string | undefined, message = ''): string {
  const d = intlDigits(phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return d ? `https://wa.me/${d}${text}` : `https://wa.me/${text}`;
}
