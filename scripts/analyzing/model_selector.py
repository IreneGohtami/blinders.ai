"""
Switch to different models for summarizing.
Currently, model 3 is the best.
"""
import os
from huggingface_hub import InferenceClient
from transformers import AutoTokenizer, pipeline


MODEL_MAP = {
    1: "facebook/bart-large-cnn",
    2: "google/flan-t5-base",
    3: "mistralai/Mistral-7B-Instruct-v0.2"
}

def load_model(model_id, video_data):
    model_name = MODEL_MAP.get(model_id)

    if model_name is None:
        raise ValueError(f"Invalid model_id: {model_id}. Available models: {list(MODEL_MAP.keys())}")

    if model_id == 1: # facebook/bart-large-cnn
        # Initialize summarizer
        summarizer = pipeline(
            "summarization",
            model=model_name,
            device="mps" # Use "mps" for Apple Silicon, or -1 for CPU, 0 for CUDA GPU
        )
        # Construct prompt
        prompt = (
            "You are an AI video analyst. "
            "Describe the narrative, theme, pacing, video quality, "
            "smoothness of transitions, and clarity of audio.\n\n"
            f"Data:\n{video_data}" # Requires video_data argument
        )
        # Generate text
        resp = summarizer(
            prompt,
            max_length=1024,
            min_length=150,
            do_sample=False
        )
        return resp[0]["summary_text"]

    elif model_id == 2: # google/flan-t5-base
        # Initialize tokenizer and summarizer
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        summarizer = pipeline("text2text-generation", model=model_name, tokenizer=tokenizer, truncation=True)

        prompt_prefix = "Summarize this part of the video:\n"
        max_input_tokens = 512

        # Helper function for chunking
        def _chunk_text_flan(text:str, tokenizer, max_input_tokens:int, prompt_prefix:str=""):
            tokens = tokenizer.encode(text, add_special_tokens=True)
            prefix_tokens = tokenizer.encode(prompt_prefix, add_special_tokens=True)
            allowed = max_input_tokens - len(prefix_tokens)
            chunks = []
            for i in range(0, len(tokens), allowed):
                chunk_tokens = tokens[i:i+allowed]
                chunk_text = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
                chunks.append(chunk_text)
            return chunks

        chunks = _chunk_text_flan(video_data, tokenizer, max_input_tokens, prompt_prefix)

        partial_summaries = []
        for chunk in chunks:
            prompt = prompt_prefix + chunk
            resp = summarizer(
                prompt,
                max_new_tokens=150,
                truncation=True
            )
            partial_summaries.append(resp[0]["generated_text"])

        # Combine partials into a final summary
        joined = " ".join(partial_summaries)
        final_prompt = "Combine these partial summaries into a final narrative:\n" + joined
        resp = summarizer(
            final_prompt,
            max_new_tokens=200,
            truncation=True
        )
        return resp[0]["generated_text"]

    elif model_id == 3: # mistralai/Mistral-7B-Instruct-v0.3
        HF_TOKEN = os.getenv("HF_TOKEN")
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN environment variable not set. Required for Mistral model.")

        client = InferenceClient(model=model_name, token=HF_TOKEN)

        prompt = f"""You are an AI video analyst. Based on the following data, describe:
1. The narrative (story arc, flow, pacing).
2. What the video is about (main theme or category).
3. Video quality: smoothness of transitions, clarity of audio/music.

Data:
{video_data}

If there's no audio/transcript, just focus on the visual content and on-screen text if any."""

        try:
            response = client.chat.completions.create(
              model=model_name,
              messages=[
                  {"role": "user", "content": prompt}
              ],
              max_tokens=300,
            )
            return response.choices[0].message.content

        except Exception as e:
            print(f"An error occurred with Mistral model (ID {model_id}): {e}")
            return f"Error summarizing with Mistral model: {e}"

    else:
        raise ValueError(f"Unsupported model_id: {model_id}. Please choose from {list(MODEL_MAP.keys())}.")


