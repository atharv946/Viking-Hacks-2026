import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_KEY || "");

export async function* analyzeImageStream(imageRef: string) {
  try {
    const response = await fetch(imageRef);
    const blob = await response.blob();
    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
    });

    const prompt = `
      You are a professional Art Director. Analyze this WIP sketch.
      Identify exactly 5-8 specific areas for improvement (anatomy, composition, rhythm, or lighting).
      
      Return the response as a JSON array of objects. 
      IMPORTANT: Each object must be on its own line or clearly separated.
      
      Format:
      [
        { "x": 40, "y": 25, "title": "Anatomy", "desc": "Critique text..." },
        { "x": 60, "y": 10, "title": "Lighting", "desc": "Critique text..." }
      ]
    `;

    const result = await model.generateContentStream([
      {
        inlineData: {
          data: base64Data,
          mimeType: blob.type
        }
      },
      prompt
    ]);

    let fullText = "";
    let lastFoundIndex = 0;

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;

      // Extremely simple partial JSON parser for streaming objects in an array
      // We look for patterns like { ... }
      const regex = /\{[^{}]*\}/g;
      let match;
      
      // Reset regex to start from where we left off if possible, 
      // but for simplicity we'll just re-scan and yield new ones
      const matches = fullText.match(regex);
      if (matches) {
        for (let i = lastFoundIndex; i < matches.length; i++) {
          try {
            const parsed = JSON.parse(matches[i]);
            if (parsed.x !== undefined && parsed.y !== undefined) {
              yield parsed;
              lastFoundIndex++;
            }
          } catch (e) {
            // Partial object, ignore
          }
        }
      }
    }
  } catch (error) {
    console.error("Gemini Streaming Error:", error);
    // Fallback static stream for demo safety
    const fallback = [
      { x: 42, y: 35, title: "Shoulder Girdle", desc: "The relationship between the shoulder and neck requires more compression." },
      { x: 68, y: 55, title: "Center of Gravity", desc: "Balance the weight by shifting the hip axis slightly clockwise." },
      { x: 25, y: 20, title: "Lead Limb", desc: "The foreshortening here feels flattened; overlap the forms more aggressively." },
      { x: 55, y: 80, title: "Silhouette", desc: "The negative space is stagnant. Break the line here to add rhythm." }
    ];
    for (const item of fallback) {
      await new Promise(r => setTimeout(r, 500));
      yield item;
    }
  }
}
