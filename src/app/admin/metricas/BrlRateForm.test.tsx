import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBrlRateAction } from './actions';
import { BrlRateForm } from './BrlRateForm';

vi.mock('./actions', () => ({ saveBrlRateAction: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

function submit(value: string) {
  fireEvent.change(screen.getByLabelText('Reais por dólar'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
}

describe('BrlRateForm', () => {
  it('starts with the rate in use, written the Brazilian way, and sends what the owner types', async () => {
    vi.mocked(saveBrlRateAction).mockResolvedValue({ status: 'saved' });
    render(<BrlRateForm rate={5.5} />);

    expect(screen.getByLabelText('Reais por dólar')).toHaveValue('5,50');
    submit('5,75');

    await waitFor(() => expect(saveBrlRateAction).toHaveBeenCalledOnce());
    const [, formData] = vi.mocked(saveBrlRateAction).mock.calls[0];
    expect(formData.get('brlRate')).toBe('5,75');
    expect(await screen.findByRole('status')).toHaveTextContent('Cotação salva.');
  });

  it('says what a valid rate looks like when the action refuses one', async () => {
    vi.mocked(saveBrlRateAction).mockResolvedValue({ status: 'invalid' });
    render(<BrlRateForm rate={5.5} />);

    submit('50');

    expect(await screen.findByRole('alert')).toHaveTextContent('Use um número entre 1 e 20, como 5,50.');
    const field = screen.getByLabelText('Reais por dólar');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Use um número entre 1 e 20, como 5,50.');
  });

  it('keeps what the owner typed after a refusal, so it can be corrected rather than typed again', async () => {
    vi.mocked(saveBrlRateAction).mockResolvedValue({ status: 'invalid' });
    render(<BrlRateForm rate={5.5} />);

    submit('50');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // React resets a form after its action; the field must not go back to the rate in use.
    await waitFor(() => expect(saveBrlRateAction).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Reais por dólar')).toHaveValue('50');
  });

  it('keeps the saved rate in the field after saving', async () => {
    vi.mocked(saveBrlRateAction).mockResolvedValue({ status: 'saved' });
    render(<BrlRateForm rate={5.5} />);

    submit('6,2');

    expect(await screen.findByRole('status')).toHaveTextContent('Cotação salva.');
    expect(screen.getByLabelText('Reais por dólar')).toHaveValue('6,2');
  });

  it('says it did not work when the rate could not be saved', async () => {
    vi.mocked(saveBrlRateAction).mockResolvedValue({ status: 'failed' });
    render(<BrlRateForm rate={5.5} />);

    submit('5,75');

    expect(await screen.findByRole('alert')).toHaveTextContent('Não rolou. Tenta de novo?');
  });

  it('keeps the field and the button at least 44 px tall', () => {
    render(<BrlRateForm rate={6.1234} />);

    expect(screen.getByLabelText('Reais por dólar')).toHaveValue('6,1234');
    expect(screen.getByLabelText('Reais por dólar').className).toMatch(/\bmin-h-11\b/);
    expect(screen.getByRole('button', { name: 'Salvar' }).className).toMatch(/\bmin-h-11\b/);
  });
});
