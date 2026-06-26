// player/src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PairingScreen } from './pages/PairingScreen'; // ← importação com chaves
import Player from './pages/Player'; // ← Player é default export, mantém assim

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/pair" element={<PairingScreen />} />
        <Route path="/player" element={<Player />} />
        <Route path="/play" element={<Player />} />
        <Route path="/" element={<Navigate to="/pair" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;