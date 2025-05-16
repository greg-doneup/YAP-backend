import { alignText, AlignmentResponse as ClientAlignmentResponse } from '../clients/alignment';
import { scorePronunciation, ScoringResponse as ClientScoringResponse, PronunciationScore } from '../clients/pronunciation-scorer';
import { evaluateDetailed } from '../clients/voiceScore';
import { AlignmentData, AlignmentResponse, ScoringResponse } from '../types/pronunciation';
import { WordPronunciationDetail, PhonemePronunciationDetail } from '../types/lesson';

// Passing thresholds
const WORD_SCORE_THRESHOLD = 0.7;
const PHONEME_SCORE_THRESHOLD = 0.6;
const OVERALL_SCORE_THRESHOLD = 0.8;

/**
 * Evaluate pronunciation using the three-stage pipeline
 * @param audio Audio buffer to evaluate
 * @param text Expected text
 * @param languageCode ISO language code (e.g., 'en-US')
 * @returns Object containing detailed pronunciation analysis
 */
export async function evaluatePronunciation(
  audio: Buffer,
  text: string,
  languageCode: string = 'en-US'
): Promise<{
  overallScore: number;
  pass: boolean;
  transcript: string;
  wordDetails: WordPronunciationDetail[];
  phonemeDetails: PhonemePronunciationDetail[];
  feedback: string[];
  alignmentId: string;
  scoringId: string;
  evaluationId: string;
}> {
  try {
    // Step 1: Use the integrated evaluateDetailed method from voice-score service
    const detailedEval = await evaluateDetailed(
      audio,
      text,
      languageCode,
      'wav',
      'phoneme'
    );
    
    // Return the processed results
    return {
      overallScore: detailedEval.overall_score,
      pass: detailedEval.pass,
      transcript: detailedEval.transcript,
      wordDetails: detailedEval.words || [],
      phonemeDetails: detailedEval.phonemes || [],
      feedback: detailedEval.feedback || [],
      alignmentId: detailedEval.alignment_id,
      scoringId: detailedEval.scoring_id,
      evaluationId: detailedEval.evaluation_id
    };
  } catch (error) {
    console.error('Error in evaluateDetailed method:', error);
    
    // Fallback to manual three-stage pipeline if the integrated method fails
    return evaluateManualPipeline(audio, text, languageCode);
  }
}

/**
 * Manual implementation of the three-stage pipeline as a fallback
 */
async function evaluateManualPipeline(
  audio: Buffer,
  text: string,
  languageCode: string = 'en-US'
): Promise<{
  overallScore: number;
  pass: boolean;
  transcript: string;
  wordDetails: WordPronunciationDetail[];
  phonemeDetails: PhonemePronunciationDetail[];
  feedback: string[];
  alignmentId: string;
  scoringId: string;
  evaluationId: string;
}> {
  try {
    // Stage 1: Get text-audio alignment
    const clientAlignmentResponse = await alignText(
      audio,
      text,
      languageCode,
      'wav',
      'phoneme' // alignment at phoneme level
    );
    
    // Convert client alignment response to the format needed
    const alignmentData: AlignmentData = {
      words: clientAlignmentResponse.word_alignments.map(wa => ({
        word: wa.word,
        start_time: wa.start_time,
        end_time: wa.end_time
      })),
      phonemes: clientAlignmentResponse.phoneme_alignments.map(pa => ({
        phoneme: pa.phoneme,
        word: pa.word,
        start_time: pa.start_time,
        end_time: pa.end_time
      }))
    };
    
    // Stage 2: Score the pronunciation based on alignment
    const clientScoringResponse = await scorePronunciation(
      audio,
      text,
      languageCode,
      'wav',
      {
        word_alignments: clientAlignmentResponse.word_alignments,
        phoneme_alignments: clientAlignmentResponse.phoneme_alignments,
        alignment_id: clientAlignmentResponse.alignment_id
      },
      'phoneme' // scoring at phoneme level
    );
    
    // Process word-level details
    const wordDetails: WordPronunciationDetail[] = clientScoringResponse.word_scores.map(word => ({
      word: word.word,
      start_time: word.start_time,
      end_time: word.end_time,
      score: word.score,
      issues: word.issues || []
    }));
    
    // Process phoneme-level details
    const phonemeDetails: PhonemePronunciationDetail[] = clientScoringResponse.phoneme_scores.map(phoneme => ({
      phoneme: phoneme.phoneme,
      word: phoneme.word,
      start_time: phoneme.start_time,
      end_time: phoneme.end_time,
      score: phoneme.score,
      issue: phoneme.issue || ''
    }));
    
    // Generate feedback based on issues
    const feedback = generateFeedback(clientScoringResponse, languageCode);
     // Calculate overall pass/fail
    const overallScore = clientScoringResponse.overall_score.score;
    const pass = overallScore >= OVERALL_SCORE_THRESHOLD;

    return {
      overallScore,
      pass,
      transcript: text, // Use original text as fallback since client response doesn't have transcript
      wordDetails,
      phonemeDetails,
      feedback,
      alignmentId: clientAlignmentResponse.alignment_id,
      scoringId: clientScoringResponse.scoring_id,
      evaluationId: `manual-${Date.now()}`
    };
  } catch (error) {
    console.error('Error in manual pronunciation pipeline:', error);
    throw new Error(`Pronunciation evaluation failed: ${error}`);
  }
}

/**
 * Generate human-readable feedback based on scoring results
 */
function generateFeedback(scoringResponse: ClientScoringResponse, languageCode: string): string[] {
  const feedback: string[] = [];
  
  // Overall feedback
  if (scoringResponse.overall_score.score < 0.6) {
    feedback.push('Your pronunciation needs more practice. Try listening to the example and repeating.');
  } else if (scoringResponse.overall_score.score < 0.8) {
    feedback.push('Your pronunciation is improving. Focus on the highlighted sounds for better clarity.');
  } else {
    feedback.push('Good job! Your pronunciation is clear and accurate.');
  }
  
  // Word-specific feedback
  const problematicWords = scoringResponse.word_scores
    .filter(word => word.score < WORD_SCORE_THRESHOLD)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  
  if (problematicWords.length > 0) {
    feedback.push(`Focus on improving these words: ${problematicWords.map(w => w.word).join(', ')}.`);
  }
  
  // Phoneme-specific feedback (for most common issues)
  const phonemeIssues: Record<string, number> = {};
  scoringResponse.phoneme_scores
    .filter(p => p.score < PHONEME_SCORE_THRESHOLD)
    .forEach(p => {
      const issue = p.issue || 'pronunciation';
      phonemeIssues[issue] = (phonemeIssues[issue] || 0) + 1;
    });
  
  // Add feedback for top 2 phoneme issues
  Object.entries(phonemeIssues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([issue, count]) => {
      feedback.push(`Work on your ${issue} (${count} occurrences).`);
    });
  
  return feedback;
}

/**
 * Check if pronunciation meets minimum quality standards
 */
export function isPronunciationAcceptable(
  wordDetails: WordPronunciationDetail[],
  overallScore: number
): boolean {
  // Check if overall score meets threshold
  if (overallScore < OVERALL_SCORE_THRESHOLD) {
    return false;
  }
  
  // Check if critical words are pronounced well enough
  const criticalWordCount = Math.ceil(wordDetails.length * 0.6); // 60% of words must be good
  const acceptableWords = wordDetails.filter(word => word.score >= WORD_SCORE_THRESHOLD);
  
  return acceptableWords.length >= criticalWordCount;
}
