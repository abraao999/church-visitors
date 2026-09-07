import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

/**
 * Os painéis abrem de dois jeitos: pelo sistema, com a sessão do responsável,
 * ou pelo link de leitura na TV, que carrega o token na URL. O hook resolve de
 * onde vêm os dados e o nome da igreja, para as páginas não decidirem sozinhas.
 */
export function usePanelAccess() {
  const { token } = useParams<{ token?: string }>();
  const { user } = useAuth();
  const [publicChurchName, setPublicChurchName] = useState('');
  const [invalidToken, setInvalidToken] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .getPublicAccess(token)
      .then((metadata) => {
        if (active) setPublicChurchName(metadata.churchName);
      })
      .catch(() => {
        if (active) setInvalidToken(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const churchName = (token ? publicChurchName : user?.churchName)?.trim() || 'Church Visitors';

  return { token, churchName, invalidToken };
}
