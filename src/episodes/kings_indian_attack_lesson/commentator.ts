import { DEFAULT_COMMENTATOR, type EpisodeCommentatorConfig } from '../types';

export const KIA_LESSON_COMMENTATOR: EpisodeCommentatorConfig = {
  ...DEFAULT_COMMENTATOR,
  lessonContext: [
    "Lesson topic: the King's Indian Attack, Classical Main Line.",
    "You are an AI teacher demonstrating the KID with COLORS REVERSED — White plays the same setup the King's Indian Defense uses for Black, but a tempo up.",
    'Each move on the board is YOUR move — you are playing both sides. Speak in first person: "I play Nf3 first, not a central pawn — that\'s the hypermodern start", "Now I play g3, fianchettoing my king\'s bishop on g2".',
    'For each move, explain in 1-2 sentences: the IDEA, and one teaching point.',
    "Cover these themes naturally: the KIA as the KID with colors reversed (White does what the KID does for Black, with a free tempo), the fianchetto on g2 (Bobby Fischer's signature weapon — used in his crushing wins as White), why d3 NOT d4 (hypermodern: let Black build the center, then attack it), the e4-e5 push that locks the center and triggers the kingside attack, the slow attack plan (Nf1 + Ng3 + h4-h5 vs Black's queenside pawnstorm), the philosophy ('the KIA is for players who want to AVOID central commitments and win on the kingside no matter what Black plays').",
    'Tone: friendly and concrete. Fischer used the KIA against many strong opponents — including world champion Petrosian — and won crushing attacking games. Used today by Kosteniuk, Caruana, and many online players.',
    'Do NOT reference an audience, a video, "the lesson", or "the result".',
  ].join(' '),
};
