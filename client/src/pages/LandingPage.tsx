import { Link } from 'react-router-dom';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../auth/AuthContext';
import './LandingPage.css';

const features: Array<{
  icon: AppIconName;
  title: string;
  description: string;
}> = [
  {
    icon: 'users',
    title: 'Visitantes por QR Code',
    description: 'Cadastre famílias e visitantes de forma rápida, sem papel e sem filas.',
  },
  {
    icon: 'prayer',
    title: 'Pedidos de oração',
    description: 'Receba pedidos com privacidade e controle o que pode aparecer no telão.',
  },
  {
    icon: 'car',
    title: 'Avisos de veículos',
    description: 'Ajude a equipe a resolver bloqueios, faróis acesos e outros avisos do estacionamento.',
  },
  {
    icon: 'panels',
    title: 'Painel para TV',
    description: 'Projete visitantes, pedidos autorizados e avisos em telas preparadas para o culto.',
  },
  {
    icon: 'link',
    title: 'Acessos sem login',
    description: 'Compartilhe QR Codes com permissões limitadas para portaria, oração e avisos.',
  },
  {
    icon: 'chart',
    title: 'Dados por igreja',
    description: 'Cada igreja acessa somente suas próprias informações, relatórios e configurações.',
  },
];

const securityItems = [
  'Permissões por equipe',
  'Pedidos só vão ao telão com autorização',
  'Retenção e privacidade de dados',
  'Acessos limitados por finalidade',
];

export function LandingPage() {
  const { user } = useAuth();
  const appTarget = user ? '/inicio' : '/login';

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="Eclesiafy">
          <span className="landing-brand-mark">✝</span>
          <span>Eclesiafy</span>
        </Link>
        <nav aria-label="Navegação da página inicial">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#seguranca">Segurança</a>
        </nav>
        <div className="landing-nav-actions">
          <ThemeToggle compact />
          <Link to="/login" className="landing-login-link">
            Entrar
          </Link>
          <Link to={appTarget} className="landing-nav-button">
            {user ? 'Abrir painel' : 'Criar conta'}
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">
            <AppIcon name="users" />
            Recepção digital para igrejas
          </span>
          <h1>Organize visitantes, pedidos de oração e avisos do culto em um só lugar.</h1>
          <p>
            A Eclesiafy ajuda sua igreja a receber melhor, cuidar das pessoas e projetar
            informações no culto com segurança.
          </p>
          <div className="landing-hero-actions">
            <Link to={appTarget} className="landing-primary">
              Começar agora
              <AppIcon name="arrow" />
            </Link>
            <a href="#como-funciona" className="landing-secondary">
              <AppIcon name="panels" />
              Ver como funciona
            </a>
          </div>
          <div className="landing-proof-row" aria-label="Benefícios principais">
            <span><AppIcon name="users" /> Igrejas mais acolhedoras</span>
            <span><AppIcon name="heartHand" /> Comunidades mais conectadas</span>
            <span><AppIcon name="chart" /> Organização com propósito</span>
          </div>
        </div>

        <div className="landing-product" aria-label="Prévia do produto">
          <div className="landing-dashboard-card">
            <div className="landing-dashboard-header">
              <span>Visão geral</span>
              <small>Primeira Igreja Batista</small>
            </div>
            <div className="landing-metric-grid">
              <div>
                <AppIcon name="users" />
                <strong>48</strong>
                <span>Visitantes hoje</span>
              </div>
              <div>
                <AppIcon name="prayer" />
                <strong>23</strong>
                <span>Pedidos recebidos</span>
              </div>
            </div>
            <div className="landing-activity-list">
              <span><AppIcon name="check" /> Novo visitante cadastrado</span>
              <span><AppIcon name="check" /> Pedido de oração recebido</span>
              <span><AppIcon name="check" /> Aviso de veículo enviado</span>
            </div>
          </div>
          <div className="landing-phone-card">
            <strong>Seja bem-vindo!</strong>
            <span>Aponte a câmera e envie seu pedido</span>
            <div className="landing-qr" aria-hidden="true">
              {Array.from({ length: 49 }, (_, index) => (
                <i key={index} className={index % 2 === 0 || index % 5 === 0 ? 'filled' : ''} />
              ))}
            </div>
            <button type="button">Enviar pedido</button>
          </div>
          <div className="landing-tv-card">
            <span>AO VIVO</span>
            <strong>Avisos da igreja</strong>
            <p>Culto de jovens · Hoje às 19h</p>
            <p>Campanha de alimentos · Doe e faça a diferença</p>
          </div>
        </div>
      </section>

      <section id="recursos" className="landing-section landing-features">
        <div className="landing-section-heading">
          <h2>Tudo que sua igreja precisa no dia do culto</h2>
          <p>Recursos pensados para uma recepção mais organizada, acolhedora e segura.</p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="landing-feature-card">
              <AppIcon name={feature.icon} />
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-panel-preview" aria-labelledby="landing-panel-title">
        <div className="landing-panel-copy">
          <span className="landing-plan-label">Para o momento do culto</span>
          <h2 id="landing-panel-title">Painel do culto pronto para a TV</h2>
          <p>
            Mostre visitantes de hoje, cidades e pedidos autorizados em uma tela limpa,
            feita para projeção.
          </p>
          <div className="landing-panel-benefits">
            <article>
              <AppIcon name="users" />
              <div>
                <h3>Visitantes de hoje</h3>
                <p>Exiba nomes, cidades e observações de boas-vindas.</p>
              </div>
            </article>
            <article>
              <AppIcon name="prayer" />
              <div>
                <h3>Pedidos autorizados</h3>
                <p>Mostre apenas pedidos aprovados, com respeito e segurança.</p>
              </div>
            </article>
            <article>
              <AppIcon name="activity" />
              <div>
                <h3>Atualização ao vivo</h3>
                <p>Novos registros aparecem automaticamente durante o culto.</p>
              </div>
            </article>
          </div>
        </div>

        <div className="landing-tv-preview" aria-label="Prévia do painel do culto na TV">
          <div className="landing-tv-preview-screen">
            <div className="landing-tv-preview-top">
              <div className="landing-tv-church">
                <span>✝</span>
                <div>
                  <strong>AD UMUARAMA</strong>
                  <small>Igreja conectada</small>
                </div>
              </div>
              <div className="landing-tv-live">
                <span>AO VIVO</span>
                <em>7 DE SETEMBRO</em>
              </div>
            </div>
            <h3>CULTO DE HOJE</h3>
            <div className="landing-tv-preview-grid">
              <section className="landing-tv-visitors">
                <h4><AppIcon name="users" /> Visitantes de hoje</h4>
                <article>
                  <span className="landing-tv-avatar"><AppIcon name="user" /></span>
                  <div>
                    <strong>ABRAÃO</strong>
                    <small>UMUARAMA</small>
                  </div>
                  <em>Aniversário hoje</em>
                </article>
                <article>
                  <span className="landing-tv-avatar"><AppIcon name="user" /></span>
                  <div>
                    <strong>ADASSA</strong>
                    <small>UMUARAMA</small>
                  </div>
                </article>
              </section>
              <section className="landing-tv-prayers">
                <h4><AppIcon name="prayer" /> Pedidos de oração</h4>
                <p>Pela família</p>
                <p>Saúde e direção</p>
                <span><AppIcon name="check" /> Aprovados para exibição</span>
              </section>
            </div>
            <footer>
              <AppIcon name="panels" />
              Informações aparecem automaticamente durante o culto.
            </footer>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="landing-section landing-how">
        <div className="landing-section-heading">
          <h2>Como funciona</h2>
          <p>Em poucos passos, sua igreja já pode começar a usar.</p>
        </div>
        <div className="landing-steps">
          <article>
            <span>1</span>
            <AppIcon name="pin" />
            <h3>Crie a conta da igreja</h3>
            <p>Cadastre a igreja e ative o ambiente em minutos.</p>
          </article>
          <article>
            <span>2</span>
            <AppIcon name="link" />
            <h3>Compartilhe os QR Codes</h3>
            <p>Use acessos separados para visitantes, oração e avisos.</p>
          </article>
          <article>
            <span>3</span>
            <AppIcon name="panels" />
            <h3>Acompanhe pelo painel</h3>
            <p>Veja tudo em tempo real e controle o que será exibido.</p>
          </article>
        </div>
      </section>

      <section id="seguranca" className="landing-security">
        <div>
          <AppIcon name="shield" />
          <h2>Cada igreja vê apenas os próprios dados</h2>
          <p>Privacidade, controle e segurança para sua comunidade.</p>
        </div>
        <ul>
          {securityItems.map((item) => (
            <li key={item}>
              <AppIcon name="check" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="planos" className="landing-section landing-pricing">
        <div className="landing-section-heading">
          <span className="landing-plan-label">Planos</span>
          <h2>Escolha o plano ideal para a sua igreja</h2>
          <p>Recursos que se adaptam ao tamanho da sua comunidade.</p>
        </div>
        <div className="landing-price-cards">
          <article>
            <h3>Plano Inicial</h3>
            <p>Ideal para igrejas em crescimento.</p>
            <ul>
              <li>Visitantes e pedidos de oração</li>
              <li>Painel para TV</li>
              <li>Usuários da equipe</li>
              <li>Suporte por e-mail</li>
            </ul>
            <strong>Sob consulta</strong>
            <Link to="/login">Falar com um consultor</Link>
          </article>
          <article className="featured">
            <span>Mais popular</span>
            <h3>Plano Igreja</h3>
            <p>Para igrejas de todos os tamanhos.</p>
            <ul>
              <li>Todos os recursos do plano inicial</li>
              <li>Relatórios e estatísticas</li>
              <li>Mais opções de personalização</li>
              <li>Suporte prioritário</li>
            </ul>
            <strong>Sob consulta</strong>
            <Link to="/login">Quero este plano</Link>
          </article>
        </div>
      </section>

      <section className="landing-final-cta">
        <div>
          <h2>Pronto para organizar sua recepção?</h2>
          <p>Conheça hoje e veja como é simples transformar a experiência da sua igreja.</p>
        </div>
        <Link to={appTarget}>
          Criar conta da igreja
          <AppIcon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
