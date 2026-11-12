// heartcore is for human-made pictures. These checks catch the AI images that
// say so in their own file or description. They can't catch an image whose
// tell-tale data was stripped, so reports and moderation still matter.

// Labels that AI tools and their makers write into image files: the IPTC /
// C2PA "digital source type" for AI media, generator names, and the text
// chunks Stable Diffusion front-ends add to PNGs.
const FILE_MARKERS: [RegExp, string][] = [
  [/compositeWithTrainedAlgorithmicMedia/, 'edited with AI (content credentials)'],
  [/trainedAlgorithmicMedia/, 'made with AI (content credentials)'],
  [/compositeSynthetic/, 'a synthetic composite (content credentials)'],
  [/Midjourney/i, 'Midjourney'],
  [/DALL[-Â··]*E/, 'DALL·E'],
  [/ChatGPT|OpenAI/, 'OpenAI'],
  [/Stable[ _-]?Diffusion|stability\.ai/i, 'Stable Diffusion'],
  [/NovelAI/, 'NovelAI'],
  [/Adobe Firefly|com\.adobe\.firefly/i, 'Adobe Firefly'],
  [/Leonardo\.Ai/i, 'Leonardo'],
  [/Ideogram/i, 'Ideogram'],
  [/Bing Image Creator|Microsoft Designer/i, 'Microsoft image creator'],
  [/ComfyUI/, 'ComfyUI'],
  [/tEXtparameters\x00|iTXtparameters\x00/, 'Stable Diffusion settings'],
  [/tEXtprompt\x00|iTXtprompt\x00|tEXtworkflow\x00/, 'a generation prompt'],
]

/** What in an image file says it was made or edited by AI, or null. */
export function findAiMarker(bytes: Uint8Array): string | null {
  const text = new TextDecoder('latin1').decode(bytes)
  for (const [pattern, label] of FILE_MARKERS) if (pattern.test(text)) return label
  return null
}

export async function checkImageFile(file: Blob): Promise<string | null> {
  return findAiMarker(new Uint8Array(await file.arrayBuffer()))
}

// Words in a library photo's title, tags or description that mark it as AI.
const WORDS = /\b(ai[\s_-]*(generated|art|artwork|image|images|render|photo)|generated (by|with) ai|midjourney|stable[\s_-]?diffusion|dall[\s·-]*e|generative[\s_-]*(ai|art|fill)|text[\s_-]*to[\s_-]*image|ai[\s_-]*edited|deepfake)\b/i

/** True when a photo's own words say it's AI-made or AI-edited. */
export function looksAiByWords(img: { caption?: string; tags?: string[] }): boolean {
  if (img.tags?.some((t) => t.toLowerCase() === 'ai' || t.toLowerCase() === 'aiart')) return true
  return WORDS.test([img.caption ?? '', ...(img.tags ?? [])].join(' '))
}
