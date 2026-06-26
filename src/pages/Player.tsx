// player/src/pages/Player.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

interface MediaItem {
  id: string;
  file_name: string;
  media_type: 'image' | 'video';
  storage_path: string;
  duration: number;
}

export default function Player() {
  const navigate = useNavigate();
  const location = useLocation();

  const [playlistItems, setPlaylistItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const currentPlaylistIdRef = useRef<string | null>(null);

  // ============================================================
  // 1. FUNÇÃO PARA BUSCAR PLAYLIST (por ID)
  // ============================================================
  const fetchPlaylistItems = async (playlistId: string): Promise<MediaItem[] | null> => {
    try {
      console.log('📥 Buscando itens da playlist:', playlistId);

      const { data: items, error: itemsError } = await supabase
        .from('playlist_items')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (itemsError) {
        console.error('❌ Erro ao buscar itens:', itemsError);
        return null;
      }

      if (!items || items.length === 0) {
        console.warn('⚠️ Playlist vazia.');
        return null;
      }

      const mediaIds = items.map((item) => item.media_asset_id).filter(Boolean);
      const { data: mediaAssets, error: mediaError } = await supabase
        .from('media_assets')
        .select('*')
        .in('id', mediaIds);

      if (mediaError) {
        console.error('❌ Erro ao buscar mídias:', mediaError);
        return null;
      }

      const formatted = items
        .map((item) => {
          const media = mediaAssets?.find((m) => m.id === item.media_asset_id);
          if (!media) return null;
          return {
            id: media.id,
            file_name: media.file_name || 'Sem nome',
            media_type: media.media_type || 'image',
            storage_path: media.storage_path,
            duration: item.duration || 10,
          };
        })
        .filter((item): item is MediaItem => item !== null && !!item.storage_path);

      if (formatted.length === 0) return null;
      return formatted;
    } catch (err) {
      console.error('❌ Erro ao buscar itens:', err);
      return null;
    }
  };

  // ============================================================
  // 2. FUNÇÃO DE FALLBACK PARA AGENDAMENTO (CONSULTA SEPARADA)
  // ============================================================
  const fallbackGetSchedule = async (deviceId: string, now: string): Promise<string | null> => {
    try {
      // Primeiro, tenta para o dispositivo específico
      const { data, error } = await supabase
        .from('schedules')
        .select('playlist_id')
        .eq('is_active', true)
        .eq('device_id', deviceId)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        console.log('📅 Agendamento para device específico:', data.playlist_id);
        return data.playlist_id;
      }

      // Se não encontrou, tenta para device_id = NULL (todas as TVs)
      const { data: dataAll, error: errorAll } = await supabase
        .from('schedules')
        .select('playlist_id')
        .eq('is_active', true)
        .is('device_id', null)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!errorAll && dataAll) {
        console.log('📅 Agendamento para todas as TVs:', dataAll.playlist_id);
        return dataAll.playlist_id;
      }

      console.log('📅 Nenhum agendamento ativo no fallback.');
      return null;
    } catch (err) {
      console.error('❌ Erro no fallback:', err);
      return null;
    }
  };

  // ============================================================
  // 3. FUNÇÃO PARA BUSCAR AGENDAMENTO ATIVO (COM FALLBACK)
  // ============================================================
  const getActiveSchedulePlaylist = async (deviceId: string): Promise<string | null> => {
    try {
      const now = new Date().toISOString();
      console.log('🔍 Verificando agendamento para deviceId:', deviceId);

      // Consulta principal usando .or()
      const { data, error } = await supabase
        .from('schedules')
        .select('playlist_id, name, start_date, end_date')
        .eq('is_active', true)
        .or(`device_id.eq.${deviceId},device_id.is.null`)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ Erro na consulta principal:', error);
        return await fallbackGetSchedule(deviceId, now);
      }

      if (data) {
        console.log('📅 Agendamento ENCONTRADO:', data.name, 'Playlist ID:', data.playlist_id);
        return data.playlist_id;
      }

      // Se a consulta principal não retornou nada, tenta fallback
      console.log('📅 Nenhum agendamento na consulta principal, tentando fallback...');
      return await fallbackGetSchedule(deviceId, now);
    } catch (err) {
      console.error('❌ Erro inesperado no agendamento:', err);
      return null;
    }
  };

  // ============================================================
  // 4. FUNÇÃO PARA CARREGAR PLAYLIST (COM FORÇA QUANDO AGENDAMENTO)
  // ============================================================
  const loadPlaylist = async (deviceId: string, showLoading: boolean = true) => {
    if (showLoading) setLoading(true);

    try {
      // Buscar dispositivo com maybeSingle para evitar 406
      const { data: device, error: deviceError } = await supabase
        .from('devices')
        .select('active_playlist_id')
        .eq('id', deviceId)
        .maybeSingle();

      if (deviceError) {
        console.error('❌ Erro ao buscar dispositivo:', deviceError);
        if (showLoading) {
          setError('Erro ao buscar dispositivo: ' + deviceError.message);
          setLoading(false);
        }
        return;
      }

      if (!device) {
        console.warn('⚠️ Dispositivo não encontrado.');
        if (showLoading) {
          setError('Dispositivo não encontrado.');
          setLoading(false);
        }
        return;
      }

      // Verifica agendamento ativo (SEMPRE)
      const scheduledPlaylistId = await getActiveSchedulePlaylist(deviceId);
      let targetPlaylistId = scheduledPlaylistId || device.active_playlist_id || null;

      if (!targetPlaylistId) {
        if (showLoading) {
          setError('Nenhuma playlist vinculada.');
          setLoading(false);
        }
        return;
      }

      const isScheduled = !!scheduledPlaylistId;

      // Se não há agendamento e a playlist já está em execução, ignora
      if (!isScheduled && currentPlaylistIdRef.current === targetPlaylistId) {
        console.log('⏩ Playlist já está em execução, ignorando.');
        if (showLoading) setLoading(false);
        return;
      }

      if (isScheduled) {
        console.log('🔄 Agendamento ativo forçando recarga da playlist:', targetPlaylistId);
      }

      // Buscar itens da playlist
      const newItems = await fetchPlaylistItems(targetPlaylistId);
      if (!newItems || newItems.length === 0) {
        if (showLoading) {
          setError('Playlist vazia.');
          setLoading(false);
        }
        return;
      }

      console.log('🔄 Trocando playlist para:', targetPlaylistId, isScheduled ? '(agendamento)' : '(padrão)');
      currentPlaylistIdRef.current = targetPlaylistId;

      setPlaylistItems(newItems);
      setCurrentIndex(0);

      // Buscar configurações da playlist
      try {
        const { data: playlistConfig } = await supabase
          .from('playlists')
          .select('audio_enabled, orientation')
          .eq('id', targetPlaylistId)
          .maybeSingle();

        if (playlistConfig) {
          setAudioEnabled(playlistConfig.audio_enabled ?? false);
          setOrientation(playlistConfig.orientation || 'horizontal');
        } else {
          setAudioEnabled(false);
          setOrientation('horizontal');
        }
      } catch (configError) {
        console.warn('⚠️ Não foi possível buscar configurações da playlist, usando padrões.');
        setAudioEnabled(false);
        setOrientation('horizontal');
      }

      if (showLoading) setLoading(false);
    } catch (err: any) {
      console.error('❌ Erro ao carregar playlist:', err);
      if (showLoading) {
        setError('Erro ao carregar playlist.');
        setLoading(false);
      }
    }
  };

  // ============================================================
  // 5. EFFECT PRINCIPAL (INICIALIZAÇÃO E POLLING)
  // ============================================================
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const playlistId = params.get('playlistId');
    const deviceIdParam = params.get('deviceId');

    if (playlistId) {
      console.log('🔗 Modo direto:', playlistId);
      if (deviceIdParam) localStorage.setItem('deviceId', deviceIdParam);
      (async () => {
        const items = await fetchPlaylistItems(playlistId);
        if (items) {
          setPlaylistItems(items);
          currentPlaylistIdRef.current = playlistId;
        } else {
          setError('Playlist não encontrada.');
        }
        setLoading(false);
      })();
      return;
    }

    const storedDeviceId = localStorage.getItem('deviceId');
    if (!storedDeviceId) {
      navigate('/pair');
      return;
    }

    loadPlaylist(storedDeviceId, true);

    if (scheduleCheckInterval.current) {
      clearInterval(scheduleCheckInterval.current);
    }
    scheduleCheckInterval.current = setInterval(() => {
      console.log('⏰ Verificando agendamentos...');
      loadPlaylist(storedDeviceId, false);
    }, 15000);

    return () => {
      if (scheduleCheckInterval.current) {
        clearInterval(scheduleCheckInterval.current);
      }
    };
  }, [location.search, navigate]);

  // ============================================================
  // 6. LÓGICA DE REPRODUÇÃO (LOOP INFINITO)
  // ============================================================
  const nextMedia = () => {
    if (playlistItems.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % playlistItems.length);
  };

  useEffect(() => {
    if (playlistItems.length === 0 || loading) return;

    const media = playlistItems[currentIndex];
    if (!media) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (media.media_type === 'video' && videoRef.current) {
      // Evita o erro "play() interrupted by new load"
      videoRef.current.src = media.storage_path;
      videoRef.current.muted = !audioEnabled;
      videoRef.current.load();
      videoRef.current.play().catch((err) => {
        // Ignora AbortError porque é normal durante troca de playlist
        if (err.name !== 'AbortError') {
          console.error('❌ Erro ao reproduzir vídeo:', err);
        }
        // Tenta novamente após 1s
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        }, 1000);
      });
    } else if (media.media_type === 'image') {
      timerRef.current = setTimeout(() => {
        nextMedia();
      }, media.duration * 1000);
    }
  }, [currentIndex, playlistItems, loading, audioEnabled]);

  // ============================================================
  // 7. RENDER
  // ============================================================
  if (loading) {
    return <div style={styles.centered}>Carregando...</div>;
  }

  if (error) {
    return <div style={styles.centered}>{error}</div>;
  }

  if (playlistItems.length === 0) {
    return <div style={styles.centered}>Nenhuma mídia.</div>;
  }

  const current = playlistItems[currentIndex];

  return (
    <div
      style={{
        ...styles.playerContainer,
        transform: orientation === 'vertical' ? 'rotate(90deg)' : 'none',
        width: orientation === 'vertical' ? '100vh' : '100vw',
        height: orientation === 'vertical' ? '100vw' : '100vh',
      }}
    >
      {current.media_type === 'video' ? (
        <video
          ref={videoRef}
          style={styles.media}
          autoPlay
          loop
          muted={!audioEnabled}
          playsInline
          onEnded={nextMedia}
          onError={() => {
            console.error('❌ Erro no vídeo, pulando...');
            nextMedia();
          }}
        />
      ) : (
        <img
          src={current.storage_path}
          alt={current.file_name}
          style={styles.media}
          onError={(e) => {
            console.error('❌ Erro ao carregar imagem:', current.storage_path);
            e.currentTarget.src =
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect width="400" height="300" fill="%23333"/%3E%3Ctext x="200" y="150" font-family="Arial" font-size="20" fill="%23aaa" text-anchor="middle"%3EImagem indisponível%3C/text%3E%3C/svg%3E';
            setTimeout(() => {
              e.currentTarget.src = current.storage_path;
            }, 5000);
          }}
        />
      )}
      <div style={styles.overlay}>
        <span>{current.file_name}</span>
        <span>
          {currentIndex + 1} / {playlistItems.length}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 8. ESTILOS
// ============================================================
const styles: { [key: string]: React.CSSProperties } = {
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#000',
    color: '#fff',
    fontSize: '20px',
  },
  playerContainer: {
    background: '#000',
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
  },
  overlay: {
    position: 'absolute' as const,
    bottom: '20px',
    left: '20px',
    right: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    background: 'rgba(0,0,0,0.6)',
    padding: '10px 20px',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    pointerEvents: 'none' as const,
  },
};