import { Bot, Context, session, SessionFlavor } from 'grammy';
import { apiWithoutAuth } from '../api/tgApi.js';

// ─── Session data stored per chat ───
interface BotSession {
  lastCreate?: {
    name: string;
    entryFee: number;
    timestamp: number;
  };
}

type BotContext = Context & SessionFlavor<BotSession>;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

let bot: Bot<BotContext> | null = null;

/**
 * Format a deep link URL for a tournament.
 */
function formatDeepLink(baseUrl: string, tournamentName: string, accessToken: string): string {
  const slug = tournamentName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  const tokenPrefix = accessToken.slice(0, 8);
  return `${baseUrl}/t/${slug}-${tokenPrefix}`;
}

/**
 * Escape MarkdownV2 special characters.
 */
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ─── Commands ───

async function cmdStart(ctx: BotContext) {
  const baseUrl = process.env.BASE_URL || 'https://xtournament.duckdns.org';
  await ctx.reply(
    '⚽ *TOSS Bot — Tournament Operations*\\n\\n' +
    'Create and manage eFootball tournaments right from your Telegram group\\.\\n\\n' +
    '*How it works:*\\n' +
    '1\\. Add me to your group\\n' +
    '2\\. Type `/create "Friday Cup" 50`\\n' +
    '3\\. Bot creates tournament \\+ shares join link\\n' +
    '4\\. Players tap the button below to open TOSS\\n\\n' +
    '*Commands:*\\n' +
    '`/create "name" \\[fee\\]` — Create tournament\\n' +
    '`/count` — Players registered\\n' +
    '`/newlink` — Revoke \\& regenerate link\\n' +
    '`/close` — Close registration\\n' +
    '`/status` — Tournament status\\n\\n' +
    '🔽 Tap below to open TOSS:',
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{
            text: '⚽ Open TOSS',
            web_app: { url: baseUrl },
          }],
        ],
      },
    }
  );
}

async function cmdCreate(ctx: BotContext) {
  if (!ctx.chat || ctx.chat.type === 'private') {
    return ctx.reply('❌ Add me to a *group* first, then use `/create` there\\.', { parse_mode: 'MarkdownV2' });
  }

  if (!ctx.match) {
    return ctx.reply(
      '📋 Usage: `/create "Tournament Name" [entry_fee]`\\n\\n' +
      'Examples:\\n' +
      '`/create "Friday Night Cup"` — free entry\\n' +
      '`/create "Pro League" 100` — KES 100 entry',
      { parse_mode: 'MarkdownV2' }
    );
  }

  const input = ctx.match as string;

  const quotedMatch = input.match(/^"([^"]+)"\s*(\d*)$/);
  const unquotedMatch = input.match(/^(\S+)\s*(\d*)$/);

  let name: string;
  let entryFee = 0;

  if (quotedMatch) {
    name = quotedMatch[1];
    entryFee = quotedMatch[2] ? parseInt(quotedMatch[2]) : 0;
  } else if (unquotedMatch) {
    name = unquotedMatch[1];
    entryFee = unquotedMatch[2] ? parseInt(unquotedMatch[2]) : 0;
  } else {
    return ctx.reply('❌ Could not parse\\. Use: `/create "Friday Cup" 50`', { parse_mode: 'MarkdownV2' });
  }

  if (!name || name.length < 2) {
    return ctx.reply('❌ Tournament name too short\\.', { parse_mode: 'MarkdownV2' });
  }

  if (name.length > 60) {
    return ctx.reply('❌ Tournament name too long \\(max 60 chars\\)\\.', { parse_mode: 'MarkdownV2' });
  }

  if (entryFee < 0 || entryFee > 10000) {
    return ctx.reply('❌ Entry fee must be between 0 and 10,000 KES\\.', { parse_mode: 'MarkdownV2' });
  }

  const organizerId = ctx.from?.id;
  if (!organizerId) {
    return ctx.reply('❌ Could not identify organizer\\.', { parse_mode: 'MarkdownV2' });
  }

  try {
    const result = await apiWithoutAuth.createTournament({
      name,
      entryFee,
      isPrivate: true,
      maxPlayers: 16,
      format: 'knockout',
      platform: 'efootball',
      ownerTelegramId: String(organizerId),
      telegramGroupId: String(ctx.chat.id),
    });

    const deepLink = formatDeepLink(
      process.env.BASE_URL || 'https://xtournament.duckdns.org',
      result.name,
      result.accessToken
    );

    const feeText = entryFee > 0 ? `💰 Entry: *KES ${entryFee}*` : '🆓 Free entry';
    const progressBar = '░░░░░░░░░░░░░░░░ 0/16';

    await ctx.reply(
      `🏆 *${escapeMd(result.name)}*\\n\\n` +
      `${feeText}\\n` +
      `📊 ${escapeMd(progressBar)}\\n\\n` +
      `👇 Tap the button to open TOSS and join:\\n` +
      `🔗 ${escapeMd(deepLink)}\\n\\n` +
      `Only this group can access\\.\\n` +
      `Use \`/newlink\` to revoke\\.`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '⚽ Join TOSS',
              web_app: { url: deepLink },
            }],
          ],
        },
      }
    );

    ctx.session.lastCreate = { name, entryFee, timestamp: Date.now() };

  } catch (err: any) {
    console.error('[Bot] Create failed:', err);
    const msg = err?.error || err?.message || 'Unknown error';
    await ctx.reply(`❌ Failed to create tournament: ${escapeMd(msg)}\\.`);
  }
}

async function cmdCount(ctx: BotContext) {
  if (!ctx.chat) return;

  try {
    const result = await apiWithoutAuth.getTournamentByGroup(String(ctx.chat.id));
    if (!result) {
      return ctx.reply('❌ No active tournament in this group\\. Use `/create` to start one\\.', { parse_mode: 'MarkdownV2' });
    }

    const count = result.participantCount || 0;
    const max = result.maxPlayers || 16;
    const filled = Math.round((count / max) * 16);
    const bar = '█'.repeat(filled) + '░'.repeat(16 - filled);

    await ctx.reply(
      `📊 *${escapeMd(result.name)}*\\n\\n` +
      `${bar} ${count}/${max}\\n\\n` +
      `${count >= max ? '✅ Tournament is full!' : `${max - count} spots remaining`}`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (err: any) {
    await ctx.reply('❌ Could not fetch tournament info\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function cmdNewLink(ctx: BotContext) {
  if (!ctx.chat) return;

  try {
    const result = await apiWithoutAuth.regenerateTournamentLink(String(ctx.chat.id));
    if (!result) {
      return ctx.reply('❌ No active tournament in this group\\.', { parse_mode: 'MarkdownV2' });
    }

    const deepLink = formatDeepLink(
      process.env.BASE_URL || 'https://xtournament.duckdns.org',
      result.name,
      result.accessToken
    );

    await ctx.reply(
      `🔄 *New link generated\\!*\\n\\n` +
      `Old link is now invalid\\.\\n\\n` +
      `👇 New join link:\\n` +
      `🔗 ${escapeMd(deepLink)}`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (err: any) {
    await ctx.reply('❌ Could not regenerate link\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function cmdClose(ctx: BotContext) {
  if (!ctx.chat) return;

  try {
    const result = await apiWithoutAuth.closeRegistration(String(ctx.chat.id));
    if (!result) {
      return ctx.reply('❌ No active tournament in this group\\.', { parse_mode: 'MarkdownV2' });
    }

    await ctx.reply(
      `🔒 *Registration closed for ${escapeMd(result.name)}*\\n\\n` +
      `${result.participantCount} players registered\\.\\n` +
      `Use \`/status\` to check bracket status\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (err: any) {
    await ctx.reply('❌ Could not close registration\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function cmdStatus(ctx: BotContext) {
  if (!ctx.chat) return;

  try {
    const result = await apiWithoutAuth.getTournamentByGroup(String(ctx.chat.id));
    if (!result) {
      return ctx.reply('❌ No active tournament in this group\\.', { parse_mode: 'MarkdownV2' });
    }

    const statusEmoji: Record<string, string> = {
      open: '🟢',
      registration_open: '🟢',
      check_in: '🟡',
      in_progress: '🔴',
      completed: '✅',
    };

    await ctx.reply(
      `${statusEmoji[result.status] || '⚪'} *${escapeMd(result.name)}*\\n\\n` +
      `Status: ${escapeMd(result.status.replace(/_/g, ' '))}\\n` +
      `Players: ${result.participantCount}/${result.maxPlayers}\\n` +
      `Format: ${escapeMd(result.format)}\\n` +
      `${result.entryFee > 0 ? `Entry: KES ${result.entryFee}` : 'Free entry'}`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (err: any) {
    await ctx.reply('❌ Could not fetch status\\.', { parse_mode: 'MarkdownV2' });
  }
}

// ─── Bot initialization ───

export function initBot(): Bot<BotContext> | null {
  if (!BOT_TOKEN) {
    console.log('[Bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  bot = new Bot<BotContext>(BOT_TOKEN);

  bot.use(session({ initial: (): BotSession => ({}) }));

  bot.command('start', cmdStart);
  bot.command('help', cmdStart);
  bot.command('create', cmdCreate);
  bot.command('count', cmdCount);
  bot.command('newlink', cmdNewLink);
  bot.command('close', cmdClose);
  bot.command('status', cmdStatus);

  bot.catch((err) => {
    console.error('[Bot] Error:', err.message);
  });

  bot.start({
    onStart: () => console.log('[Bot] Telegram bot started'),
    drop_pending_updates: true,
  });

  console.log('[Bot] Telegram bot initialized');
  return bot;
}

export function getBot(): Bot<BotContext> | null {
  return bot;
}
