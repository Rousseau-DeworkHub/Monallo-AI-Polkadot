"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
type CodeTab =
  | "curl"
  | "javascript"
  | "typescript"
  | "python"
  | "cpp"
  | "rust"
  | "java";

const TAB_META: { id: CodeTab; label: string; syntax: string }[] = [
  { id: "curl", label: "cURL", syntax: "bash" },
  { id: "javascript", label: "JavaScript", syntax: "javascript" },
  { id: "typescript", label: "TypeScript", syntax: "typescript" },
  { id: "python", label: "Python", syntax: "python" },
  { id: "cpp", label: "C++", syntax: "cpp" },
  { id: "rust", label: "Rust", syntax: "rust" },
  { id: "java", label: "Java", syntax: "java" },
];

export function DocsBaseUrl() {
  const [baseUrl, setBaseUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/api/monallo/v1`);
    }
  }, []);
  if (!baseUrl) return <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195]">https://your-domain/api/monallo/v1</code>;
  return <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#14F195] break-all">{baseUrl}</code>;
}

export function DocsApiCodeBlocks() {
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<CodeTab>("curl");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/api/monallo/v1`);
    }
  }, []);

  const fullBase = baseUrl || "https://your-domain/api/monallo/v1";

  const codeByTab: Record<CodeTab, string> = {
    curl: `curl ${fullBase}/chat/completions \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0.7
  }'`,

    javascript: `// Node.js 18+ or browser
const baseUrl = "${fullBase}";
const apiKey = process.env.MONALLO_API_KEY || "YOUR_API_KEY";

const res = await fetch(baseUrl + "/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + apiKey,
  },
  body: JSON.stringify({
    model: "gpt-5.2",
    messages: [{ role: "user", content: "Hello!" }],
    temperature: 0.7,
  }),
});

console.log("Status:", res.status);
console.log(await res.text());`,

    typescript: `// TypeScript (Node.js 18+ or browser)
const baseUrl = "${fullBase}";
const apiKey = process.env.MONALLO_API_KEY ?? "YOUR_API_KEY";

type ChatResponse = {
  id?: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const res = await fetch(baseUrl + "/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + apiKey,
  },
  body: JSON.stringify({
    model: "gpt-5.2",
    messages: [{ role: "user", content: "Hello!" }],
    temperature: 0.7,
  }),
});

const data = (await res.json()) as ChatResponse;
console.log("Status:", res.status);
console.log(data.choices?.[0]?.message?.content ?? "No response");`,

    python: `# Python 3.9+
import os
import requests

base_url = "${fullBase}"
api_key = os.getenv("MONALLO_API_KEY", "YOUR_API_KEY")

resp = requests.post(
    base_url + "/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    },
    json={
        "model": "gpt-5.2",
        "messages": [{"role": "user", "content": "Hello!"}],
        "temperature": 0.7,
    },
    timeout=60,
)

print("Status:", resp.status_code)
print(resp.text)`,

    cpp: `// C++17 (libcurl + nlohmann/json)
#include <curl/curl.h>
#include <iostream>
#include <string>

int main() {
  const std::string base_url = "${fullBase}";
  const std::string api_key = "YOUR_API_KEY";
  const std::string payload = R"({
    "model":"gpt-5.2",
    "messages":[{"role":"user","content":"Hello!"}],
    "temperature":0.7
  })";

  CURL* curl = curl_easy_init();
  if (!curl) return 1;

  struct curl_slist* headers = nullptr;
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, ("Authorization: Bearer " + api_key).c_str());

  curl_easy_setopt(curl, CURLOPT_URL, (base_url + "/chat/completions").c_str());
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload.c_str());

  CURLcode res = curl_easy_perform(curl);
  std::cout << "Result: " << res << std::endl;

  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  return 0;
}`,

    rust: `// Rust (reqwest + tokio + serde_json)
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base_url = "${fullBase}";
    let api_key = std::env::var("MONALLO_API_KEY").unwrap_or("YOUR_API_KEY".to_string());
    let client = reqwest::Client::new();

    let res = client
        .post(format!("{}/chat/completions", base_url))
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {}", api_key))
        .json(&json!({
            "model": "gpt-5.2",
            "messages": [{"role": "user", "content": "Hello!"}],
            "temperature": 0.7
        }))
        .send()
        .await?;

    println!("Status: {}", res.status());
    println!("{}", res.text().await?);
    Ok(())
}`,

    java: `// Java 11+ (java.net.http)
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class MonalloExample {
  public static void main(String[] args) throws Exception {
    String baseUrl = "${fullBase}";
    String apiKey = System.getenv().getOrDefault("MONALLO_API_KEY", "YOUR_API_KEY");
    String body = "{\\"model\\":\\"gpt-5.2\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Hello!\\"}],\\"temperature\\":0.7}";

    HttpRequest request = HttpRequest.newBuilder()
      .uri(URI.create(baseUrl + "/chat/completions"))
      .header("Content-Type", "application/json")
      .header("Authorization", "Bearer " + apiKey)
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build();

    HttpClient client = HttpClient.newHttpClient();
    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
    System.out.println("Status: " + response.statusCode());
    System.out.println(response.body());
  }
}`,
  };

  const activeMeta = TAB_META.find((tab) => tab.id === activeTab) ?? TAB_META[0];
  const activeCode = codeByTab[activeTab];

  const copyActiveCode = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeCode);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = activeCode;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TAB_META.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              activeTab === tab.id
                ? "bg-[#9945FF]/20 border-[#9945FF]/40 text-[#bda2ff]"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="px-3 py-2 text-xs text-gray-500 border-b border-white/10 flex items-center justify-between">
          {activeMeta.label}
          <button
            type="button"
            onClick={copyActiveCode}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
            title={copied ? "Copied" : "Copy"}
          >
            {copied ? <Check className="w-4 h-4 text-[#14F195]" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <SyntaxHighlighter
          language={activeMeta.syntax}
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            background: "transparent",
            padding: "1rem",
            fontSize: "0.85rem",
          }}
          wrapLines={true}
          lineProps={() => ({
            style: {
              background: "transparent",
              backgroundColor: "transparent",
            },
          })}
          codeTagProps={{
            style: {
              background: "transparent",
              backgroundColor: "transparent",
            },
          }}
          preTagProps={{
            style: {
              background: "transparent",
              backgroundColor: "transparent",
            },
          }}
          wrapLongLines={false}
          showLineNumbers={false}
        >
          {activeCode}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
