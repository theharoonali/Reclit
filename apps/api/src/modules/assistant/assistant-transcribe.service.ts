import { transcribeAudio } from "../../ai/elevenlabs";
import { describeError } from "../../common/errors";
import type { MulterFile } from "../../common/multipart";
import {
  AssistantTranscriptionFailedError,
  AssistantTranscriptionInvalidError,
  AssistantTranscriptionUnavailableError,
} from "./assistant.errors";
import type { AssistantTranscription } from "./assistant.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The capsule's mic:
// a browser recording (`MediaRecorder` — webm/opus, or mp4 on Safari) goes
// through the same ElevenLabs call the audio cells use (`src/ai/elevenlabs.ts`)
// and comes back as text for the user to review. Nothing is stored.

/** A minute of speech at MediaRecorder's default bitrate is well under this. */
export const MAX_TRANSCRIBE_BYTES = 10 * 1024 * 1024;

const isAudio = (mimeType: string): boolean =>
  mimeType.startsWith("audio/") ||
  // Some browsers label an audio-only MediaRecorder blob with its container.
  mimeType === "video/webm" ||
  mimeType === "video/mp4";

export class AssistantTranscribeService {
  async transcribe(file: MulterFile): Promise<AssistantTranscription> {
    if (!isAudio(file.mimetype)) {
      throw new AssistantTranscriptionInvalidError(
        `"${file.mimetype}" is not an audio recording`,
      );
    }
    if (file.buffer.byteLength > MAX_TRANSCRIBE_BYTES) {
      throw new AssistantTranscriptionInvalidError(
        `the recording is larger than ${MAX_TRANSCRIBE_BYTES} bytes`,
      );
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new AssistantTranscriptionUnavailableError();
    }
    try {
      const transcription = await transcribeAudio({
        filename: file.originalname || "recording",
        mediaType: file.mimetype,
        data: file.buffer,
      });
      return {
        text: transcription.text,
        languageCode: transcription.languageCode,
      };
    } catch (error) {
      throw new AssistantTranscriptionFailedError(describeError(error).message);
    }
  }
}

export const assistantTranscribeService = new AssistantTranscribeService();
