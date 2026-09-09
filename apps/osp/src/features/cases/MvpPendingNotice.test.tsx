import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MvpPendingNotice } from './MvpPendingNotice';

describe('MVP pending scope acknowledgement', () => {
  it('shows Crane pending evidence without an approval action', () => {
    const html = renderToStaticMarkup(<MvpPendingNotice caseId="f2fa004f-d674-446c-80ca-e929cce75b51" />);
    expect(html).toContain('Certificate of Insurance pendiente');
    expect(html).toContain('no habilita firma ni envío');
    expect(html).not.toMatch(/<(button|input|form|a)[\s>]/);
  });
  it.each(['ddbb675c-a769-4741-9b85-7d4798509913', 'another-case', ''])('does not apply to %s', (caseId) => {
    expect(renderToStaticMarkup(<MvpPendingNotice caseId={caseId} />)).toBe('');
  });
});
