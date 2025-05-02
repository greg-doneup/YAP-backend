import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

// Define the missing types
interface DailyResult {
  id: string;
  wallet: string;
  date: string;
  score: number;
  pass: boolean;
  type?: string;
}

interface DailyCompletion {
  id: string;
  wallet: string;
  date: string;
  completed: boolean;
  score?: number;
  reward_tx?: string;
}

const pkgDef = loadSync("proto/voice.proto");
const proto  = loadPackageDefinition(pkgDef) as any;

const client = new proto.voicescore.VoiceScore(
  "voice-score:50051",
  credentials.createInsecure()
);

export function evaluate(audio: Buffer, expected: string): Promise<{ score: number }> {
  return new Promise((res, rej) =>
    client.Evaluate({ audio, expected_phrase: expected }, (e: any, r: any) =>
      e ? rej(e) : res({ score: r.score })
    )
  );
}
export function getVocab(): Promise<{ vocab: string[] }> {
  return new Promise((res, rej) =>
    client.GetVocab({}, (e: any, r: any) =>
      e ? rej(e) : res({ vocab: r.vocab })
    )
  );
}
export function getVocabItem(id: string): Promise<{ item: { id: string; term: string; translation: string } }> {
  return new Promise((res, rej) =>
    client.GetVocabItem({ id }, (e: any, r: any) =>
      e ? rej(e) : res({ item: r })
    )
  );
}
export function getVocabItems(ids: string[]): Promise<{ items: { id: string; term: string; translation: string }[] }> {
  return new Promise((res, rej) =>
    client.GetVocabItems({ ids }, (e: any, r: any) =>
      e ? rej(e) : res({ items: r.items })
    )
  );
}
export function getDailyResults(wallet: string, date: string): Promise<{ results: DailyResult[] }> {
  return new Promise((res, rej) =>
    client.GetDailyResults({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ results: r.results })
    )
  );
}
export function getDailyCompletions(wallet: string, date: string): Promise<{ completions: DailyCompletion[] }> {
  return new Promise((res, rej) =>
    client.GetDailyCompletions({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ completions: r.completions })
    )
  );
}
export function getDailyCompletion(wallet: string, date: string): Promise<{ completion: DailyCompletion }> {
  return new Promise((res, rej) =>
    client.GetDailyCompletion({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ completion: r })
    )
  );
}