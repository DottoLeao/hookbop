import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTION_PEOPLE, Projection } from './Projection';

// Intl writes money with a no-break space, which Testing Library reads as a plain space.

describe('Projection', () => {
  it('starts at 50 people a month times the cost per active person', () => {
    render(<Projection perPersonUsd={0.32} people={8} brlRate={5.5} />);

    expect(DEFAULT_PROJECTION_PEOPLE).toBe(50);
    expect(screen.getByLabelText('Pessoas por mês')).toHaveValue('50');
    expect(screen.getByText('Com 50 pessoas por mês, o gasto seria')).toBeInTheDocument();
    // 50 × 0,32 = 16,00; at 5,50 reais per dollar, 88,00.
    expect(screen.getByText(`US$ 16,00`)).toBeInTheDocument();
    expect(screen.getByText(`≈ R$ 88,00`)).toBeInTheDocument();
    expect(
      screen.getByText(`Pela média de US$ 0,32 por pessoa ativa nos últimos 30 dias, horário de Brasília (8 pessoas).`),
    ).toBeInTheDocument();
  });

  it('follows the number of people as it is typed', () => {
    render(<Projection perPersonUsd={0.32} people={8} brlRate={5.5} />);

    fireEvent.change(screen.getByLabelText('Pessoas por mês'), { target: { value: '1000' } });

    expect(screen.getByText('Com 1.000 pessoas por mês, o gasto seria')).toBeInTheDocument();
    expect(screen.getByText(`US$ 320,00`)).toBeInTheDocument();
    expect(screen.getByText(`≈ R$ 1.760,00`)).toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['text', 'cem'],
    ['a fraction', '10,5'],
    ['negative', '-3'],
  ])('asks for a whole number when the field is %s', (_label, value) => {
    render(<Projection perPersonUsd={0.32} people={8} brlRate={5.5} />);

    const field = screen.getByLabelText('Pessoas por mês');
    fireEvent.change(field, { target: { value } });

    expect(screen.getByText('Digite um número inteiro de pessoas.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/o gasto seria/)).not.toBeInTheDocument();
  });

  it('says it cannot project with nobody active in the last 30 days', () => {
    render(<Projection perPersonUsd={null} people={0} brlRate={5.5} />);

    expect(screen.getByText('Ainda não há pessoas ativas nos últimos 30 dias para projetar.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pessoas por mês')).not.toBeInTheDocument();
  });

  it('keeps the field 44 px tall and its text 16 px, so a phone does not zoom into it', () => {
    render(<Projection perPersonUsd={0.32} people={8} brlRate={5.5} />);

    expect(screen.getByLabelText('Pessoas por mês').className).toMatch(/\bmin-h-11\b.*\btext-button\b|\btext-button\b.*\bmin-h-11\b/);
  });
});
