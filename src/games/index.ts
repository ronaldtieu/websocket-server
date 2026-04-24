// server-side game barrel. importing this file for its side effects
// registers every game with the registry. each new game's worktree adds
// exactly one line here; that's the only shared file a game branch
// touches, and appends rarely conflict.

import './remove-one/index.js';
import './crooked-cops/index.js';
import './time-auction/index.js';
import './balance-mancala/index.js';
import './halloween-monster/index.js';
import './doubt-and-bet/index.js';
import './cube-board/index.js';
import './treasure-island/index.js';
import './archduke/src/index.js';
// games: add future registrations here, one per line.
