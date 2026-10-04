const { sql } = require('../../db');
const {
  getPresentationState,
  setPresentationState,
  getStudioSettings,
  getPromoSettings,
  setPromoSettings
} = require('../services/cache');
const {
  startTimer,
  stopTimer,
  pauseTimer,
  setTimerRemaining,
  getTimerRemaining,
  startCelebrationTimer,
  stopCelebrationTimer,
  getCelebrationRemaining
} = require('../services/timer');

// In-memory registry of active presentation & casting screens
const connectedDisplays = new Map();

function broadcastDisplaysList(io) {
  const list = Array.from(connectedDisplays.values());
  io.to('admin').emit('cast:list', list);
}

function registerQuizSockets(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a room (presentation, cast, or admin)
    socket.on('join', (room, metadata = {}) => {
      socket.join(room);
      console.log(`  → ${socket.id} joined room: ${room}`);

      const pState = getPresentationState();
      const studio = getStudioSettings();
      const promo = getPromoSettings();

      if (room === 'presentation' || room === 'cast' || room === 'admin') {
        if (pState) socket.emit('state:sync', pState);
        if (studio) socket.emit('studio:sync', studio);
        if (promo) socket.emit('promo:sync', promo);

        const celRemaining = getCelebrationRemaining();
        if (celRemaining > 0) {
          socket.emit('celebration:start', { duration: celRemaining });
        }
      }

      // Track display screens (presentation & cast)
      if (room === 'presentation' || room === 'cast') {
        const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        const displayName = metadata.name || (room === 'cast' ? `Casting Screen ${connectedDisplays.size + 1}` : 'Main Presentation Display');
        connectedDisplays.set(socket.id, {
          socketId: socket.id,
          type: room,
          name: displayName,
          resolution: metadata.resolution || '1920x1080',
          userAgent: metadata.userAgent || socket.handshake.headers['user-agent'] || 'Unknown Browser',
          ip: clientIp,
          connectedAt: new Date().toISOString(),
          status: 'online'
        });
        broadcastDisplaysList(io);
      }
    });

    // Explicit display telemetry registration
    socket.on('display:register', (metadata = {}) => {
      const existing = connectedDisplays.get(socket.id) || {};
      const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
      connectedDisplays.set(socket.id, {
        socketId: socket.id,
        type: metadata.type || existing.type || 'cast',
        name: metadata.name || existing.name || `Screen ${connectedDisplays.size + 1}`,
        resolution: metadata.resolution || existing.resolution || '1920x1080',
        userAgent: metadata.userAgent || existing.userAgent || 'Unknown',
        ip: clientIp,
        connectedAt: existing.connectedAt || new Date().toISOString(),
        status: 'online'
      });
      broadcastDisplaysList(io);
    });

    // Admin requesting display list
    socket.on('cast:get-list', () => {
      socket.emit('cast:list', Array.from(connectedDisplays.values()));
    });

    // ── Admin: Update State ──
    socket.on('state:update', async (data) => {
      try {
        // Stop timer and timer sound if:
        // 1. Timer explicitly turned off (timer_running === false)
        // 2. New question selected or dispatched (current_question_id !== undefined)
        // 3. Question is being revealed / shown only (show_question === true && show_options === false)
        // 4. Answer is being revealed (reveal_answer === true)
        const shouldStopTimer = (
          data.timer_running === false ||
          data.current_question_id !== undefined ||
          (data.show_question === true && data.show_options === false) ||
          data.reveal_answer === true
        );

        if (shouldStopTimer) {
          stopTimer();
          data.timer_running = false;
        }

        const allowedFields = [
          'current_question_id', 'active_screen', 'show_question', 'show_options',
          'reveal_answer', 'audio_status', 'active_level', 'timer_running',
          'timer_remaining', 'active_session_id', 'active_contestant_id',
          'active_lifeline', 'show_timer', 'show_scoreboard', 'show_explanation',
          'game_mode',
          'cast_sync_mode', 'cast_screen', 'cast_scene', 'cast_blackout',
          'stage_blackout', 'stage_dock_visible', 'cast_ticker_text',
          'cast_ticker_visible', 'cast_watermark_visible', 'cast_sound_enabled'
        ];
        const fields = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
          if (data[field] !== undefined) {
            fields.push(`${field} = $${idx++}`);
            values.push(data[field]);
          }
        }
        if (fields.length === 0) return;

        values.push(1);
        const result = await sql.query(
          `UPDATE presentation_state SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
          values
        );
        const state = result[0];

        if (state.current_question_id) {
          // Auto-mark question as presented/used
          await sql.query('UPDATE questions SET presented = TRUE WHERE id = $1', [state.current_question_id]);
          const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [state.current_question_id]);
          state.question = qRes[0] || null;
          if (state.question) {
            state.question.presented = true;
          }
        } else {
          state.question = null;
        }

        if (shouldStopTimer) {
          const resetVal = data.timer_remaining !== undefined 
            ? data.timer_remaining 
            : (state.question?.timer_override || 30);
          setTimerRemaining(resetVal);
          state.timer_remaining = resetVal;
          state.timer_running = false;
          try {
            await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = $1 WHERE id = 1', [resetVal]);
          } catch (te) {
            console.error('Error updating reset timer in state:update:', te);
          }
          io.to('presentation').emit('timer:stopped');
          io.to('admin').emit('timer:stopped');
        }

        setPresentationState(state);
        io.to('presentation').emit('state:sync', state);
        io.to('cast').emit('state:sync', state);
        io.to('admin').emit('state:sync', state);
      } catch (err) {
        console.error('Socket state:update error:', err);
      }
    });

    // ── Admin: Instant Correct Answer Switch ──
    socket.on('question:set-correct', async (data) => {
      try {
        const { question_id, correct_answer } = data || {};
        if (!question_id || !correct_answer) return;
        const upper = String(correct_answer).toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(upper)) return;

        await sql.query('UPDATE questions SET correct_answer = $1 WHERE id = $2', [upper, question_id]);
        
        const pState = getPresentationState();
        if (pState && String(pState.current_question_id) === String(question_id)) {
          const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [question_id]);
          pState.question = qRes[0] || null;
          setPresentationState(pState);
          io.to('presentation').emit('state:sync', pState);
          io.to('admin').emit('state:sync', pState);
        } else {
          io.to('admin').emit('question:updated', { id: question_id, correct_answer: upper });
        }
      } catch (err) {
        console.error('Socket question:set-correct error:', err);
      }
    });

    // ── Admin: Live Quick Edit Question & Options ──
    socket.on('question:quick-edit', async (data) => {
      try {
        const { id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation } = data || {};
        if (!id) return;

        const updates = [];
        const vals = [];
        let idx = 1;

        if (question_text !== undefined) { updates.push(`question_text = $${idx++}`); vals.push(question_text); }
        if (option_a !== undefined) { updates.push(`option_a = $${idx++}`); vals.push(option_a); }
        if (option_b !== undefined) { updates.push(`option_b = $${idx++}`); vals.push(option_b); }
        if (option_c !== undefined) { updates.push(`option_c = $${idx++}`); vals.push(option_c); }
        if (option_d !== undefined) { updates.push(`option_d = $${idx++}`); vals.push(option_d); }
        if (correct_answer !== undefined) { updates.push(`correct_answer = $${idx++}`); vals.push(String(correct_answer).toUpperCase()); }
        if (explanation !== undefined) { updates.push(`explanation = $${idx++}`); vals.push(explanation); }

        if (updates.length === 0) return;
        vals.push(id);

        const res = await sql.query(`UPDATE questions SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
        if (res.length === 0) return;
        const updatedQ = res[0];

        const pState = getPresentationState();
        if (pState && String(pState.current_question_id) === String(id)) {
          pState.question = updatedQ;
          setPresentationState(pState);
          io.to('presentation').emit('state:sync', pState);
          io.to('admin').emit('state:sync', pState);
        } else {
          io.to('admin').emit('question:updated', updatedQ);
        }
      } catch (err) {
        console.error('Socket question:quick-edit error:', err);
      }
    });

    // ── Timer Controls ──
    socket.on('timer:start', async (data) => {
      const pState = getPresentationState();
      const duration = data?.duration !== undefined ? data.duration : (pState?.timer_remaining || 30);
      setTimerRemaining(duration);
      startTimer(io, sql, duration);

      try {
        await sql.query('UPDATE presentation_state SET timer_running = TRUE, timer_remaining = $1 WHERE id = 1', [duration]);
        if (pState) {
          pState.timer_running = true;
          pState.timer_remaining = duration;
        }
      } catch (e) {
        console.error('Timer start DB error:', e);
      }
      io.to('presentation').emit('timer:started', { remaining: duration });
      io.to('admin').emit('timer:started', { remaining: duration });
    });

    socket.on('timer:pause', async () => {
      pauseTimer();
      const current = getTimerRemaining();
      const pState = getPresentationState();

      try {
        await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = $1 WHERE id = 1', [current]);
        if (pState) {
          pState.timer_running = false;
          pState.timer_remaining = current;
        }
      } catch (e) {
        console.error('Timer pause DB error:', e);
      }
      io.to('presentation').emit('timer:paused', { remaining: current });
      io.to('admin').emit('timer:paused', { remaining: current });
    });

    socket.on('timer:stop', async () => {
      stopTimer();
      const pState = getPresentationState();
      const resetVal = pState?.question?.timer_override || 30;
      setTimerRemaining(resetVal);

      try {
        await sql.query('UPDATE presentation_state SET timer_running = FALSE, timer_remaining = $1 WHERE id = 1', [resetVal]);
        if (pState) {
          pState.timer_running = false;
          pState.timer_remaining = resetVal;
        }
      } catch (e) {
        console.error('Timer stop DB error:', e);
      }
      io.to('presentation').emit('timer:stopped');
      io.to('admin').emit('timer:stopped');
    });

    socket.on('timer:adjust', async (data) => {
      const amount = parseInt(data?.amount) || 0;
      if (amount === 0) return;
      const current = Math.max(0, getTimerRemaining() + amount);
      setTimerRemaining(current);
      const pState = getPresentationState();

      try {
        await sql.query('UPDATE presentation_state SET timer_remaining = $1 WHERE id = 1', [current]);
        if (pState) {
          pState.timer_remaining = current;
        }
      } catch (e) {
        console.error('Timer adjust DB error:', e);
      }
      io.to('presentation').emit('timer:tick', { remaining: current });
      io.to('admin').emit('timer:tick', { remaining: current });
    });

    socket.on('timer:set', async (data) => {
      const duration = parseInt(data?.duration) || 30;
      setTimerRemaining(duration);
      const pState = getPresentationState();

      try {
        await sql.query('UPDATE presentation_state SET timer_remaining = $1 WHERE id = 1', [duration]);
        if (pState) {
          pState.timer_remaining = duration;
        }
      } catch (e) {
        console.error('Timer set DB error:', e);
      }
      io.to('presentation').emit('timer:tick', { remaining: duration });
      io.to('admin').emit('timer:tick', { remaining: duration });
    });

    // ── Lifelines ──
    socket.on('lifeline:fifty-fifty', async (data) => {
      const pState = getPresentationState();
      const questionId = data?.question_id || pState?.current_question_id;
      if (!questionId) return;

      try {
        const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [questionId]);
        if (qRes.length === 0) return;
        const q = qRes[0];
        const correct = q.correct_answer;
        const allOptions = ['A', 'B', 'C', 'D'];
        const wrongOptions = allOptions.filter(o => o !== correct);
        const shuffled = wrongOptions.sort(() => Math.random() - 0.5);
        const eliminated = shuffled.slice(0, 2);

        io.to('presentation').emit('lifeline:fifty-fifty-result', { eliminated });
        io.to('admin').emit('lifeline:fifty-fifty-result', { eliminated });
      } catch (err) {
        console.error('50:50 lifeline error:', err);
      }
    });

    socket.on('lifeline:audience-poll', async (data) => {
      const pState = getPresentationState();
      const questionId = data?.question_id || pState?.current_question_id;
      if (!questionId) return;

      try {
        const qRes = await sql.query('SELECT correct_answer FROM questions WHERE id = $1', [questionId]);
        if (qRes.length === 0) return;
        const correct = qRes[0].correct_answer;
        const correctPct = 45 + Math.floor(Math.random() * 30); // 45-75%
        let remaining = 100 - correctPct;
        const poll = {};
        const options = ['A', 'B', 'C', 'D'];

        options.forEach(o => {
          if (o === correct) {
            poll[o] = correctPct;
          } else {
            const pct = o === options[options.length - 1] ? remaining : Math.floor(Math.random() * remaining);
            poll[o] = pct;
            remaining -= pct;
          }
        });

        io.to('presentation').emit('lifeline:audience-poll-result', { poll });
        io.to('admin').emit('lifeline:audience-poll-result', { poll });
      } catch (err) {
        console.error('Audience poll error:', err);
      }
    });

    // ── Sounds ──
    socket.on('sound:play', (data) => {
      io.to('presentation').emit('sound:play', data);
    });

    socket.on('sound:stop', () => {
      io.to('presentation').emit('sound:stop');
    });

    // ── Celebration ──
    socket.on('celebration:start', (data) => {
      const duration = parseInt(data?.duration) || 10;
      startCelebrationTimer(io, duration);
    });

    socket.on('celebration:stop', () => {
      stopCelebrationTimer(io);
    });

    socket.on('celebration:trigger', () => {
      startCelebrationTimer(io, 10);
    });

    // ── Promo Controls ──
    socket.on('promo:control', (data) => {
      io.to('presentation').emit('promo:control', data);
      io.to('cast').emit('promo:control', data);
      io.to('admin').emit('promo:control', data);
    });

    socket.on('promo:sound', (data) => {
      io.to('presentation').emit('promo:sound', data);
      io.to('cast').emit('promo:sound', data);
    });

    socket.on('promo:save-content', async (data) => {
      try {
        const allowedFields = [
          'eyebrow_badge', 'producer_tag', 'tagline', 'hashtag',
          'card1_tag', 'card1_title', 'card1_desc',
          'card2_tag', 'card2_title', 'card2_desc',
          'card3_tag', 'card3_chairman', 'card3_convenor', 'card3_desc',
          'card4_tag', 'card4_title', 'card4_desc',
          'reel_speed', 'reel_auto_loop', 'sound_enabled', 'active_scene'
        ];
        const fields = [];
        const values = [];
        let idx = 1;

        for (const field of allowedFields) {
          if (data && data[field] !== undefined) {
            fields.push(`${field} = $${idx++}`);
            values.push(data[field]);
          }
        }

        if (fields.length > 0) {
          values.push(1);
          const result = await sql.query(
            `UPDATE promo_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
          );
          if (result.length > 0) {
            setPromoSettings(result[0]);
            io.to('presentation').emit('promo:sync', result[0]);
            io.to('cast').emit('promo:sync', result[0]);
            io.to('admin').emit('promo:sync', result[0]);
          }
        }
      } catch (err) {
        console.error('Socket promo:save-content error:', err);
      }
    });

    // ── Casting Remote Screen Commands ──
    socket.on('cast:command', (data) => {
      // data: { target: 'all' | socketId, command: 'fullscreen' | 'reload' | 'switch-screen' | 'ping', params: {} }
      if (!data) return;
      if (data.target && data.target !== 'all') {
        io.to(data.target).emit('cast:execute', data);
      } else {
        io.to('cast').emit('cast:execute', data);
        io.to('presentation').emit('cast:execute', data);
      }
    });

    // ── Stage & Cast Independent Controls ──
    socket.on('stage:ticker', async (data) => {
      if (data && data.text !== undefined) {
        try {
          await sql.query('UPDATE presentation_state SET cast_ticker_text = $1, cast_ticker_visible = $2 WHERE id = 1', [data.text, !!data.show]);
          const cur = getPresentationState();
          if (cur) {
            cur.cast_ticker_text = data.text;
            cur.cast_ticker_visible = !!data.show;
          }
        } catch (_) {}
      }
      io.to('presentation').emit('stage:ticker', data);
      io.to('cast').emit('stage:ticker', data);
      io.to('admin').emit('stage:ticker', data);
    });

    socket.on('stage:blackout', async (data) => {
      if (data && data.blackout !== undefined) {
        try {
          await sql.query('UPDATE presentation_state SET stage_blackout = $1 WHERE id = 1', [!!data.blackout]);
          const cur = getPresentationState();
          if (cur) cur.stage_blackout = !!data.blackout;
        } catch (_) {}
      }
      io.to('presentation').emit('stage:blackout', data);
      io.to('admin').emit('stage:blackout', data);
    });

    socket.on('cast:blackout', async (data) => {
      if (data && data.blackout !== undefined) {
        try {
          await sql.query('UPDATE presentation_state SET cast_blackout = $1 WHERE id = 1', [!!data.blackout]);
          const cur = getPresentationState();
          if (cur) cur.cast_blackout = !!data.blackout;
        } catch (_) {}
      }
      io.to('cast').emit('cast:blackout', data);
      io.to('admin').emit('cast:blackout', data);
    });

    socket.on('stage:dock', async (data) => {
      if (data && data.visible !== undefined) {
        try {
          await sql.query('UPDATE presentation_state SET stage_dock_visible = $1 WHERE id = 1', [!!data.visible]);
          const cur = getPresentationState();
          if (cur) cur.stage_dock_visible = !!data.visible;
        } catch (_) {}
      }
      io.to('presentation').emit('stage:dock', data);
      io.to('admin').emit('stage:dock', data);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      if (connectedDisplays.has(socket.id)) {
        connectedDisplays.delete(socket.id);
        broadcastDisplaysList(io);
      }
    });
  });
}

module.exports = {
  registerQuizSockets
};
