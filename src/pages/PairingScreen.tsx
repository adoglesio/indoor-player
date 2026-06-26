// player/src/pages/PairingScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';

// Gera um código de 6 dígitos aleatório
const generatePairingCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export function PairingScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [isPaired, setIsPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const isChecking = useRef(false);

  // 1. Gera um código ao iniciar
  useEffect(() => {
    const newCode = generatePairingCode();
    setCode(newCode);
    console.log('🔑 Código de pareamento gerado:', newCode);
  }, []);

  // 2. Polling para verificar se o código foi pareado (sem criar TV)
  useEffect(() => {
    if (!code) return;

    // Limpa intervalo anterior
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }

    // Função de verificação
    const checkPairing = async () => {
      if (isChecking.current) return;
      isChecking.current = true;

      try {
        console.log('🔍 Verificando pareamento para código:', code);
        const { data, error } = await supabase
          .from('devices')
          .select('id, is_paired, active_playlist_id')
          .eq('pairing_code', code)
          .maybeSingle();

        if (error) {
          console.error('❌ Erro ao verificar pareamento:', error);
          return;
        }

        setPollingAttempts(prev => prev + 1);

        if (data?.is_paired === true) {
          console.log('✅ Dispositivo pareado! ID:', data.id);
          setIsPaired(true);
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
          localStorage.setItem('deviceId', data.id);
          // Redireciona para o player após um breve delay
          setTimeout(() => navigate('/player'), 500);
        } else {
          console.log('⏳ Aguardando pareamento... (tentativa', pollingAttempts + 1, ')');
        }
      } catch (err) {
        console.error('❌ Erro inesperado:', err);
      } finally {
        isChecking.current = false;
      }
    };

    // Executa imediatamente e depois a cada 3 segundos
    checkPairing();
    pollingInterval.current = setInterval(checkPairing, 3000);

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [code, navigate, pollingAttempts]);

  // Renderização
  if (error) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#ef4444', fontSize: '20px' }}>{error}</p>
        <button onClick={() => window.location.reload()} style={styles.retryButton}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div style={styles.pairingContainer}>
      <div style={styles.pairingCard}>
        <div style={styles.logoContainer}>
          <span style={styles.logoText}>📺 NEXUS</span>
        </div>
        <h1 style={styles.title}>Parear TV</h1>
        <p style={styles.subtitle}>Digite o código abaixo no painel de controle</p>
        <div style={styles.codeContainer}>
          <span style={styles.code}>{code}</span>
        </div>
        <p style={styles.hint}>
          {isPaired ? '✅ Pareado! Redirecionando...' : '⏳ Aguardando pareamento...'}
        </p>
        <div style={styles.loadingDots}>
          <span></span><span></span><span></span>
        </div>
        <p style={styles.pollingInfo}>
          {!isPaired && `Verificando... (${pollingAttempts})`}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// ESTILOS (mesmo do código anterior)
// ============================================================
const styles: { [key: string]: React.CSSProperties } = {
  centered: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#0f172a',
    color: '#fff',
    padding: '20px',
  },
  retryButton: {
    marginTop: '20px',
    padding: '10px 20px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
  },
  pairingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#0f172a',
    padding: '20px',
  },
  pairingCard: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    padding: '48px 32px',
    borderRadius: '24px',
    textAlign: 'center' as const,
    maxWidth: '500px',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
  },
  logoContainer: {
    marginBottom: '24px',
  },
  logoText: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#4ade80',
    letterSpacing: '2px',
  },
  title: {
    color: '#fff',
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '16px',
    marginBottom: '32px',
  },
  codeContainer: {
    background: 'rgba(0,0,0,0.4)',
    padding: '24px',
    borderRadius: '16px',
    marginBottom: '32px',
    border: '2px dashed #4ade80',
  },
  code: {
    color: '#4ade80',
    fontSize: '56px',
    letterSpacing: '12px',
    fontFamily: 'monospace',
  },
  hint: {
    color: '#94a3b8',
    fontSize: '14px',
    marginBottom: '16px',
  },
  loadingDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  },
  pollingInfo: {
    color: '#6b7280',
    fontSize: '12px',
    marginTop: '12px',
  },
};