/**
 * Reads the native sample rate and channel count out of a sound file header.
 *
 * Needed because Blitz pitch is absolute: SoundPitch/ChannelPitch take a
 * frequency in hertz (FSOUND_SetFrequency) and the default is the rate stored
 * in the file (FSOUND_Sample_GetDefaults in gxSound's constructor), while
 * decodeAudioData resamples everything to the AudioContext rate and forgets
 * the original one.
 */
export interface SoundFileInfo {
	format: 'wav' | 'ogg' | 'mp3' | 'unknown';
	sampleRate: number;
	channels: number;
}

function u16(b: Uint8Array, o: number): number {
	return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function tag(b: Uint8Array, o: number, s: string): boolean {
	for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
	return true;
}

function parseWav(b: Uint8Array): SoundFileInfo | null {
	if (b.length < 12 || !tag(b, 0, 'RIFF') || !tag(b, 8, 'WAVE')) return null;
	let o = 12;
	while (o + 8 <= b.length) {
		const size = u32(b, o + 4);
		if (tag(b, o, 'fmt ') && o + 16 <= b.length) {
			return { format: 'wav', channels: u16(b, o + 10), sampleRate: u32(b, o + 12) };
		}
		o += 8 + size + (size & 1);
	}
	return null;
}

function parseOgg(b: Uint8Array): SoundFileInfo | null {
	if (b.length < 28 || !tag(b, 0, 'OggS')) return null;
	const segments = b[26];
	const packet = 27 + segments;
	// Vorbis identification header: 0x01 "vorbis", version u32, channels u8, rate u32
	if (packet + 16 > b.length || b[packet] !== 1 || !tag(b, packet + 1, 'vorbis')) return null;
	return { format: 'ogg', channels: b[packet + 11], sampleRate: u32(b, packet + 12) };
}

const MP3_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG 1
	2: [22050, 24000, 16000], // MPEG 2
	0: [11025, 12000, 8000] // MPEG 2.5
};

function parseMp3(b: Uint8Array): SoundFileInfo | null {
	let o = 0;
	if (b.length > 10 && tag(b, 0, 'ID3')) {
		o = 10 + ((b[6] & 0x7f) << 21) + ((b[7] & 0x7f) << 14) + ((b[8] & 0x7f) << 7) + (b[9] & 0x7f);
	}
	const end = Math.min(b.length - 4, o + 65536);
	for (; o < end; o++) {
		if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) continue;
		const version = (b[o + 1] >> 3) & 3;
		const layer = (b[o + 1] >> 1) & 3;
		const bitrate = (b[o + 2] >> 4) & 15;
		const rate = (b[o + 2] >> 2) & 3;
		if (version === 1 || layer === 0 || bitrate === 15 || bitrate === 0 || rate === 3) continue;
		return { format: 'mp3', sampleRate: MP3_RATES[version][rate], channels: b[o + 3] >> 6 === 3 ? 1 : 2 };
	}
	return null;
}

/** Returns null when the header is none of the three formats the game ships. */
export function parseSoundFile(bytes: Uint8Array): SoundFileInfo | null {
	return parseWav(bytes) ?? parseOgg(bytes) ?? parseMp3(bytes);
}

/** PCM length of a RIFF/WAVE file in seconds (used by the test backend, which cannot decode). */
export function wavDuration(b: Uint8Array): number | null {
	if (b.length < 12 || !tag(b, 0, 'RIFF') || !tag(b, 8, 'WAVE')) return null;
	let o = 12;
	let byteRate = 0;
	while (o + 8 <= b.length) {
		const size = u32(b, o + 4);
		if (tag(b, o, 'fmt ')) byteRate = u32(b, o + 16);
		if (tag(b, o, 'data')) return byteRate > 0 ? Math.min(size, b.length - o - 8) / byteRate : null;
		o += 8 + size + (size & 1);
	}
	return null;
}
