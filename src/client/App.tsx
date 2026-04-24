import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Settings, Users, ArrowRight, Share2, Shield, Scan, LogIn, BookOpen, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from './lib/socket';
import { cn } from './lib/utils';
import { Player, GameState, MOOD_COLORS, GameInfo } from './types';
import { MOCK_GAMES } from './constants';
import { getClientGame } from './games/registry';

// --- Components ---

const Button = ({ children, onClick, className, variant = 'primary', disabled = false }: any) => {
  const variants = {
    primary: `bg-white text-black hover:bg-zinc-200 shadow-2xl shadow-white/5 glow-button rounded-xl`,
    secondary: `bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl`,
    danger: `bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20 rounded-xl`,
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02, y: -1 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-8 py-3 font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2",
        variants[variant as keyof typeof variants],
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </motion.button>
  );
};

const PlayerCard = ({ player, index }: any) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ delay: index * 0.05, type: 'spring', stiffness: 300 }}
    className="player-card group relative bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col items-center gap-4 hover:border-white/30"
  >
    {player.isCpu && (
      <div className="absolute top-2 right-2 bg-white/10 text-white px-2 py-0.5 rounded-full text-[7px] font-black tracking-[0.3em]">
        BOT
      </div>
    )}
    <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center border border-white/10 group-hover:border-white/30 shadow-inner">
      <img src={player.avatar} alt={player.name} className="w-10 h-10 rounded-full grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
    </div>
    <div className="text-center">
      <div className="font-bold text-xs truncate w-24 text-zinc-100 uppercase tracking-widest">{player.name}</div>
      <div className="text-[9px] uppercase text-zinc-500 tracking-[0.2em] font-mono mt-1">{player.isCpu ? 'CPU' : 'Status: Active'}</div>
    </div>
  </motion.div>
);

// --- Views ---

const SettingsView = ({ setStatus }: { setStatus: (s: any) => void }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
  >
    <div className="bg-zinc-900 border border-white/10 p-10 rounded-2xl w-full max-w-md relative shadow-2xl">
      <h2 className="text-xl font-bold uppercase tracking-[0.3em] mb-10 flex items-center gap-3 text-white">
        <Settings className="text-zinc-400" size={20} /> System Profile
      </h2>
      
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Uplink Stability</span>
            <span className="text-[10px] font-bold text-white tracking-widest">98%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div className="h-full bg-white w-[98%]" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer group">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-400 group-hover:text-white">Broadcast visible</span>
            <div className="w-10 h-5 bg-white rounded-full relative">
              <div className="absolute top-1 right-1 w-3 h-3 bg-black rounded-full" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer group">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-400 group-hover:text-white">Auto Deployment</span>
            <div className="w-10 h-5 bg-zinc-800 rounded-full relative">
              <div className="absolute top-1 left-1 w-3 h-3 bg-zinc-600 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 flex gap-4">
        <Button variant="primary" className="flex-1" onClick={() => setStatus('lobby')}>
          Apply
        </Button>
        <Button variant="secondary" onClick={() => setStatus('lobby')}>
          Close
        </Button>
      </div>
    </div>
  </motion.div>
);

const GameSelectionView = ({ onSelect, onCancel, currentId }: { onSelect: (id: string) => void, onCancel: () => void, currentId: string | null }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/95 backdrop-blur-2xl overflow-y-auto"
  >
    <div className="w-full max-w-6xl py-12">
      <div className="flex justify-between items-center mb-12">
        <div className="space-y-1">
          <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Select Game</h2>
          <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.4em]">Available tactical simulation units</p>
        </div>
        <Button variant="secondary" onClick={onCancel}>BACK TO LOBBY</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_GAMES.map((game) => (
          <motion.div
            key={game.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(game.id)}
            className={cn(
              "group relative bg-zinc-900/50 border rounded-[2rem] overflow-hidden cursor-pointer transition-all duration-300",
              currentId === game.id ? "border-white shadow-2xl shadow-white/10" : "border-white/5 hover:border-white/20"
            )}
          >
            <div className="aspect-video relative overflow-hidden">
              <img src={game.image} alt={game.title} className="w-full h-full object-cover grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-60 transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
              {currentId === game.id && (
                <div className="absolute top-6 right-6 bg-white text-black px-4 py-1 rounded-full text-[8px] font-black tracking-widest animate-pulse">
                  ACTIVE
                </div>
              )}
            </div>
            <div className="p-8 space-y-4">
              <div className="flex justify-between items-start">
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">{game.title}</h3>
                <div className="flex items-center gap-2 text-zinc-500">
                  <Users size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{game.minPlayers}-{game.maxPlayers}</span>
                </div>
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2 uppercase font-medium tracking-wide">
                {game.description}
              </p>
              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Type: SIMULATION</span>
                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

const HostView = ({ state, setStatus }: { state: GameState; setStatus: (s: any) => void }) => {
  // prefer the server-detected LAN URL so phones scanning the QR hit the host,
  // not their own localhost. falls back to window origin for desktop-only testing.
  const joinBase = state.lanUrl ?? window.location.origin;
  const joinUrl = `${joinBase}/?code=${state.lobbyCode}`;
  const selectedGame = MOCK_GAMES.find(g => g.id === state.selectedGameId);

  return (
    <div className="min-h-screen bg-black text-white p-12 flex flex-col justify-between overflow-hidden relative font-sans selection:bg-white selection:text-black">
      {/* Subtle Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      {/* Header section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex flex-col lg:flex-row items-start justify-between gap-12 relative z-10"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
              <Shield size={44} className="text-black" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-6xl lg:text-8xl font-black tracking-tighter uppercase leading-none">
                GAME<br /><span className="text-zinc-600">MENU</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8 text-left lg:text-right">
          {selectedGame && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden xl:flex flex-col gap-1 pr-8 border-r border-white/5"
            >
              <div className="text-zinc-600 text-[9px] font-bold tracking-[0.3em] uppercase">Target Sim</div>
              <div className="text-xl font-black tracking-tighter uppercase text-white">{selectedGame.title}</div>
            </motion.div>
          )}
          <div className="flex flex-col gap-2">
            <div className="text-zinc-600 text-[10px] font-bold tracking-[0.3em] uppercase">Status: Broadcasting</div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl px-8 py-4 border border-white/10 shadow-2xl flex items-center gap-4">
              <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest leading-none">Access:</span>
              <span className="text-4xl font-black tracking-[0.2em] text-white font-mono leading-none">{state.lobbyCode}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-12 mt-12 relative z-10 overflow-hidden">
        {/* Left Side: Selected Game and Controls */}
        <div className="lg:w-1/3 flex flex-col gap-8">
          <div className="bg-zinc-900/40 rounded-[2.5rem] border border-white/5 p-8 flex flex-col gap-8 flex-1">
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.4em] text-zinc-500">Selected Game</h2>
              {selectedGame ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="aspect-video w-full rounded-2xl overflow-hidden grayscale opacity-50 bg-zinc-800 border border-white/10">
                    <img src={selectedGame.image} alt={selectedGame.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black uppercase tracking-tight">{selectedGame.title}</h3>
                    <p className="text-zinc-500 text-xs uppercase font-medium leading-relaxed tracking-wider">
                      {selectedGame.description}
                    </p>
                  </div>
                  <Button variant="secondary" className="w-full text-[10px] py-4" onClick={() => setStatus('game-selection')}>
                    CHANGE GAME
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 border-2 border-dashed border-white/5 rounded-3xl p-8">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <Play className="text-zinc-700" size={24} />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">No game assigned</p>
                    <Button variant="primary" className="text-[10px]" onClick={() => setStatus('game-selection')}>
                      SELECT GAME
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto space-y-4 pt-8 border-t border-white/5">
              <div className="flex items-center gap-4">
                <Button 
                  className="px-8 py-6 text-xl h-auto flex-1 h-20" 
                  disabled={state.players.length === 0 || !selectedGame}
                  onClick={() => socket.emit('start-game')}
                >
                  <Play size={24} fill="currentColor" stroke="none" /> Start Match
                </Button>
                <Button variant="secondary" className="p-6 h-20 flex px-8" onClick={() => setStatus('settings')}>
                  <Settings size={24} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Player Queue */}
        <div className="flex-1 flex flex-col gap-8">
          <section className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
            <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4 gap-4 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-[0.4em] text-zinc-500">
                Players <span className="ml-4 text-white">[{state.players.length}/12]</span>
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => socket.emit('add-cpu')}
                  disabled={state.players.length >= 12}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  + Add Bot
                </button>
                <button
                  onClick={() => socket.emit('remove-cpu')}
                  disabled={!state.players.some((p: any) => p.isCpu)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  − Remove Bot
                </button>
              </div>
            </div>

            {state.players.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center gap-4 text-zinc-700"
              >
                <Users size={32} className="opacity-20 animate-pulse" />
                <p className="uppercase font-bold text-[10px] tracking-[0.5em]">Waiting for players...</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6 h-fit">
                {state.players.map((p, i) => (
                  <PlayerCard key={p.id} player={p} index={i} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* QR Code and Info */}
      <div className="absolute bottom-12 right-12 flex flex-col items-end gap-6 pointer-events-none">
        <div className="bg-white p-3 rounded-2xl shadow-2xl pointer-events-auto">
          <QRCodeSVG value={joinUrl} size={140} fgColor="#000000" bgColor="#FFFFFF" />
        </div>
        <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em]">Scan to Link Device</p>
      </div>

      <AnimatePresence>
        {state.status === 'settings' && <SettingsView setStatus={setStatus} />}
        {state.status === 'game-selection' && (
          <GameSelectionView 
            currentId={state.selectedGameId}
            onSelect={(id) => {
              socket.emit('select-game', id);
              setStatus('lobby');
            }}
            onCancel={() => setStatus('lobby')}
          />
        )}
      </AnimatePresence>
    </div>
  );
};


const ClientView = ({ state, setJoined }: { state: GameState; setJoined: (val: boolean) => void }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get('code')?.toUpperCase() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = () => {
    if (!name || !code) {
      setError('ID & PROTOCOL REQUIRED');
      return;
    }
    setLoading(true);
    socket.emit('join-lobby', { name, code });
  };

  useEffect(() => {
    socket.on('join-success', () => {
      setLoading(false);
      setJoined(true);
    });
    socket.on('join-error', (msg: string) => {
      setLoading(false);
      setError(msg);
    });
    return () => {
      socket.off('join-success');
      socket.off('join-error');
    };
  }, []);

  return (
    <div className="min-h-screen bg-black p-6 flex flex-col items-center justify-center gap-12 max-w-sm mx-auto selection:bg-white selection:text-black">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
          <Shield className="text-black" size={40} strokeWidth={2.5} />
        </div>
        <div className="space-y-1">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">
            GAME MENU
          </h1>
          <p className="text-zinc-600 text-[8px] font-bold uppercase tracking-[0.5em]">Mobile Link Interface</p>
        </div>
      </div>

      <div className="w-full space-y-6">
        <div className="bg-zinc-900 border border-white/5 p-8 rounded-2xl shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <div className="space-y-2">
            <label className="text-[9px] uppercase font-bold tracking-[0.2em] text-zinc-500 ml-1">Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full bg-black border border-white/10 p-4 rounded-xl focus:border-white focus:ring-0 outline-none text-white font-bold tracking-widest text-xs transition-all uppercase"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] uppercase font-bold tracking-[0.2em] text-zinc-500 ml-1">Room Protocol</label>
            <input 
              type="text" 
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={4}
              className="w-full bg-black border border-white/10 p-4 rounded-xl focus:border-white focus:ring-0 outline-none text-white font-black tracking-[0.8em] text-3xl text-center transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-[8px] uppercase font-bold text-center tracking-widest px-4 leading-relaxed">{error}</p>}

          <Button className="w-full p-5 text-xs py-5" onClick={handleJoin} disabled={loading}>
            {loading ? 'CONNECTING...' : <><LogIn size={14} className="mr-2" /> Connect</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

const SuccessView = ({ name, selectedGameId }: { name: string; selectedGameId: string | null }) => {
  const [showInstructions, setShowInstructions] = useState(false);
  const selectedGame = MOCK_GAMES.find(g => g.id === selectedGameId);
  const instructionsReg = selectedGameId ? getClientGame(selectedGameId) : undefined;
  const InstructionsComp = instructionsReg?.Instructions;
  const hasInstructions = !!InstructionsComp;

  return (
    <>
      <div className="min-h-screen bg-black p-6 flex flex-col items-center justify-center gap-12 animate-in fade-in zoom-in duration-700">
        <div className="relative">
          <div className="w-24 h-24 bg-zinc-900 border border-white/10 rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/5 animate-pulse" />
            <Users size={32} className="text-white relative z-10" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-[8px] font-black tracking-[0.4em] shadow-2xl">
            CONNECTED
          </div>
        </div>

        <div className="text-center space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
              You're in
            </h2>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.5em]">{name}</p>
          </div>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest max-w-[200px] leading-relaxed mx-auto">
            Waiting for the host to start the game.
          </p>
        </div>

        {selectedGame && (
          <div className="w-full max-w-[240px] flex flex-col items-center gap-4">
            <div className="text-center space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Selected game</div>
              <div className="text-sm font-black uppercase tracking-tight text-white">{selectedGame.title}</div>
            </div>
            {hasInstructions && (
              <button
                onClick={() => setShowInstructions(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
              >
                <BookOpen size={12} /> How to play
              </button>
            )}
          </div>
        )}

        <div className="w-full space-y-4 max-w-[180px] mt-4">
          <div className="h-[1px] bg-white/5 w-full" />
          <div className="flex items-center justify-center gap-2">
            <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Connected</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showInstructions && selectedGame && InstructionsComp && (
          <InstructionsModal
            title={selectedGame.title}
            onClose={() => setShowInstructions(false)}
          >
            <InstructionsComp />
          </InstructionsModal>
        )}
      </AnimatePresence>
    </>
  );
};

function InstructionsModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-y-auto"
    >
      <div className="min-h-screen flex flex-col p-6">
        <div className="sticky top-0 bg-black/80 backdrop-blur-md -mx-6 px-6 py-4 flex items-center justify-between border-b border-white/5 mb-8">
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">How to play</div>
            <div className="text-xl font-black uppercase tracking-tighter text-white">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Close instructions"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 pb-12">{children}</div>
        <button
          onClick={onClose}
          className="sticky bottom-6 w-full py-4 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-zinc-200 transition-all"
        >
          Got it
        </button>
      </div>
    </motion.div>
  );
}

// --- Main App ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    lobbyCode: '',
    status: 'lobby',
    selectedGameId: null,
    lanUrl: null,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [joined, setJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  // full server-side game-state envelope. each game's registry entry unwraps
  // its own slice (server broadcasts `{ [gameId]: ...state }`).
  const [gameStateBlob, setGameStateBlob] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || new URLSearchParams(window.location.search).has('code'));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    socket.on('player-joined', (player: Player) => {
      setGameState(prev => ({ ...prev, players: [...prev.players, player] }));
    });

    socket.on('player-left', (id: string) => {
      setGameState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== id) }));
    });

    socket.on('join-success', ({ players, lobbyCode, selectedGameId }) => {
      setGameState(prev => ({ ...prev, players, lobbyCode, selectedGameId }));
    });

    socket.on('lobby-info', ({ players, lobbyCode, selectedGameId, started, lanUrl }) => {
      setGameState(prev => ({ ...prev, players, lobbyCode, selectedGameId, lanUrl: lanUrl ?? prev.lanUrl }));
      if (started) {
        setGameStarted(true);
        // hydrate activeGameId on a mid-game refresh — game-started event
        // has already fired on the server and won't re-fire.
        if (selectedGameId) setActiveGameId(selectedGameId);
      }
    });

    socket.on('game-selected', (gameId: string) => {
      setGameState(prev => ({ ...prev, selectedGameId: gameId }));
    });

    socket.on('game-started', ({ gameId }: { gameId: string }) => {
      setGameStarted(true);
      setActiveGameId(gameId);
    });

    socket.on('game-state', (state: unknown) => {
      // server wraps each game's state under a key named after the game.
      // we store the full envelope and let the active game's registry
      // entry unwrap + shape it at render time.
      setGameStateBlob(state);
    });

    socket.on('lobby-reset', ({ lobbyCode }: { lobbyCode: string }) => {
      setGameStarted(false);
      setActiveGameId(null);
      setGameStateBlob(null);
      setJoined(false);
      setGameState(prev => ({ players: [], lobbyCode, status: 'lobby', selectedGameId: null, lanUrl: prev.lanUrl }));
    });

    socket.on('error', (payload: { message?: string }) => {
      setToast(payload?.message ?? 'something went wrong');
    });

    socket.emit('request-lobby');

    return () => {
      window.removeEventListener('resize', checkMobile);
      socket.off('player-joined');
      socket.off('player-left');
      socket.off('join-success');
      socket.off('lobby-info');
      socket.off('game-selected');
      socket.off('game-started');
      socket.off('game-state');
      socket.off('lobby-reset');
      socket.off('error');
    };
  }, []);

  // auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Gameplay render branch — overrides lobby view once game has started.
  // looks up the active game via the client registry, unwraps its state
  // from the server envelope, and renders the phone or main-screen
  // component accordingly.
  if (gameStarted && activeGameId) {
    const reg = getClientGame(activeGameId);
    const playerState = reg?.unwrapState(gameStateBlob);
    if (reg && playerState) {
      const { Phone, MainScreen, toPublicState } = reg;
      if (isMobile) {
        return (
          <>
            <main className="selection:bg-white selection:text-black">
              <Phone state={playerState} />
            </main>
            <Toast message={toast} />
          </>
        );
      }
      // main screen: treat desktop as host for skip/return controls.
      const publicState = toPublicState ? toPublicState(playerState) : playerState;
      return (
        <>
          <main className="selection:bg-white selection:text-black">
            <MainScreen
              state={publicState}
              isHost
              onReturnToLobby={() => socket.emit('return-to-lobby')}
            />
          </main>
          <Toast message={toast} />
        </>
      );
    }
  }

  return (
    <>
      <main className="selection:bg-white selection:text-black">
        <AnimatePresence mode="wait">
          {isMobile ? (
            joined ? (
              <SuccessView
              name={gameState.players.find(p => p.id === socket.id)?.name || 'OPERATIVE'}
              selectedGameId={gameState.selectedGameId}
            />
            ) : (
              <ClientView state={gameState} setJoined={setJoined} />
            )
          ) : (
            <HostView state={gameState} setStatus={(s) => setGameState(prev => ({ ...prev, status: s }))} />
          )}
        </AnimatePresence>
      </main>
      <Toast message={toast} />
    </>
  );
}

function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-zinc-900 border border-red-500/30 rounded-xl shadow-2xl"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
