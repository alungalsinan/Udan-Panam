const { getPresentationState } = require('./cache');

let timerInterval = null;
let timerRemaining = 30;

let celebrationInterval = null;
let celebrationRemaining = 0;

function startTimer(io, sql, duration) {
  stopTimer();
  timerRemaining = duration !== undefined ? duration : 30;

  timerInterval = setInterval(async () => {
    timerRemaining--;
    io.to('presentation').emit('timer:tick', { remaining: timerRemaining });
    io.to('admin').emit('timer:tick', { remaining: timerRemaining });

    if (timerRemaining <= 0) {
      stopTimer();
      io.to('presentation').emit('timer:expired');
      io.to('admin').emit('timer:expired');
      
      try {
        await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = 0 WHERE id = 1');
        const state = getPresentationState();
        if (state) {
          state.timer_running = false;
          state.timer_remaining = 0;
        }
      } catch (e) {
        console.error('Timer DB update error:', e);
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseTimer() {
  stopTimer();
}

function setTimerRemaining(val) {
  timerRemaining = Math.max(0, val);
}

function getTimerRemaining() {
  return timerRemaining;
}

function startCelebrationTimer(io, duration) {
  stopCelebrationTimer();
  celebrationRemaining = duration !== undefined ? duration : 10;
  io.to('presentation').emit('celebration:start', { duration: celebrationRemaining });
  io.to('admin').emit('celebration:start', { duration: celebrationRemaining });

  if (celebrationRemaining > 0) {
    celebrationInterval = setInterval(() => {
      celebrationRemaining--;
      io.to('presentation').emit('celebration:tick', { remaining: celebrationRemaining });
      io.to('admin').emit('celebration:tick', { remaining: celebrationRemaining });

      if (celebrationRemaining <= 0) {
        stopCelebrationTimer();
        io.to('presentation').emit('celebration:stop');
        io.to('admin').emit('celebration:stop');
      }
    }, 1000);
  }
}

function stopCelebrationTimer(io) {
  if (celebrationInterval) {
    clearInterval(celebrationInterval);
    celebrationInterval = null;
  }
  celebrationRemaining = 0;
  if (io) {
    io.to('presentation').emit('celebration:stop');
    io.to('admin').emit('celebration:stop');
  }
}

function getCelebrationRemaining() {
  return celebrationRemaining;
}

module.exports = {
  startTimer,
  stopTimer,
  pauseTimer,
  setTimerRemaining,
  getTimerRemaining,
  startCelebrationTimer,
  stopCelebrationTimer,
  getCelebrationRemaining
};
