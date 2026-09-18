import { useId, useState } from 'react';
import { AppIcon } from './AppIcon';

export type PublicDataConsentPurpose = 'visitors' | 'prayer' | 'vehicle';

interface PublicDataConsentProps {
  purpose: PublicDataConsentPurpose;
  churchName: string;
  checked: boolean;
  disabled?: boolean;
  error?: string;
  legal?: {
    termsUrl?: string;
    privacyUrl?: string;
  };
  onChange: (checked: boolean) => void;
}

const PURPOSE_COPY: Record<PublicDataConsentPurpose, {
  title: string;
  shortText: string;
  details: string[];
}> = {
  visitors: {
    title: 'Uso dos dados dos visitantes',
    shortText: 'Aceito que a igreja receba estes dados para recepção, organização do culto e acompanhamento quando autorizado.',
    details: [
      'Os nomes, cidade e observações são enviados somente para a equipe autorizada da igreja.',
      'As informações ajudam na recepção, nas boas-vindas, nos painéis do culto e no acompanhamento pastoral quando essa opção for marcada.',
      'Os registros não ficam visíveis para quem usa este acesso público.',
    ],
  },
  prayer: {
    title: 'Uso do pedido de oração',
    shortText: 'Aceito que a igreja receba meu pedido para cuidado pastoral e organização interna.',
    details: [
      'O pedido fica disponível somente para responsáveis autorizados da igreja.',
      'Ele só aparece no telão quando a opção de exibição pública for marcada.',
      'Se você escolher sigilo, seu nome não será exibido junto ao pedido.',
    ],
  },
  vehicle: {
    title: 'Uso do aviso de veículo',
    shortText: 'Aceito que a igreja receba os dados do veículo para localizar e orientar o responsável.',
    details: [
      'A placa, modelo e solicitação são enviados somente para a equipe responsável da igreja.',
      'O aviso é usado para resolver a situação durante o culto ou evento.',
      'Outros visitantes não conseguem visualizar os avisos enviados por este acesso.',
    ],
  },
};

export function PublicDataConsent({
  purpose,
  churchName,
  checked,
  disabled,
  error,
  legal,
  onChange,
}: PublicDataConsentProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const copy = PURPOSE_COPY[purpose];

  return (
    <section className={`public-data-consent${error ? ' has-error' : ''}`}>
      <label className="public-data-consent-control" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="public-data-consent-box" aria-hidden="true">
          {checked && <AppIcon name="checkPlain" />}
        </span>
        <span>
          <strong>Li e aceito o uso dos dados</strong>
          <small>{copy.shortText}</small>
        </span>
      </label>
      <button type="button" className="public-data-consent-link" onClick={() => setOpen(true)}>
        Ver uso dos dados
      </button>
      {error && (
        <p id={`${id}-error`} className="public-field-error" role="alert">
          {error}
        </p>
      )}

      {open && (
        <div className="public-data-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="public-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-modal-title`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="public-data-modal-close"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="public-data-modal-icon" aria-hidden="true">
              <AppIcon name="shield" />
            </span>
            <h2 id={`${id}-modal-title`}>{copy.title}</h2>
            <p>
              Ao enviar este formulário para <strong>{churchName}</strong>, você confirma que entende
              como as informações serão usadas.
            </p>
            <ul>
              {copy.details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {(legal?.termsUrl || legal?.privacyUrl) && (
              <p className="public-data-modal-links">
                {legal.termsUrl && (
                  <a href={legal.termsUrl} target="_blank" rel="noopener noreferrer">
                    Termos de uso
                  </a>
                )}
                {legal.termsUrl && legal.privacyUrl ? ' · ' : ''}
                {legal.privacyUrl && (
                  <a href={legal.privacyUrl} target="_blank" rel="noopener noreferrer">
                    Política de privacidade
                  </a>
                )}
              </p>
            )}
            <button type="button" className="public-primary-button" onClick={() => setOpen(false)}>
              Entendi
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
