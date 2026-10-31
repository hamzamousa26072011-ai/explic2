const chatTab = document.getElementById("chat-tab");
const paperTab = document.getElementById("paper-tab");
const chatPanel = document.getElementById("chat-panel");
const paperPanel = document.getElementById("paper-panel");

function selectTab(which) {
  const chatActive = which === "chat";
  chatTab.setAttribute("aria-selected", String(chatActive));
  paperTab.setAttribute("aria-selected", String(!chatActive));
  chatPanel.classList.toggle("active", chatActive);
  paperPanel.classList.toggle("active", !chatActive);
}

chatTab.addEventListener("click", () => selectTab("chat"));
paperTab.addEventListener("click", () => selectTab("paper"));

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatMessages = document.getElementById("chat-messages");
const chatEmpty = document.getElementById("chat-empty");
const chatHistory = [];

function addBubble(role, text) {
  chatEmpty?.remove();
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || chatSend.disabled) return;

  chatHistory.push({ role: "user", content: message });
  addBubble("user", message);
  chatInput.value = "";
  chatSend.disabled = true;
  chatSend.textContent = "Thinking…";
  const thinkingBubble = addBubble("assistant", "Thinking…");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-site-key": "key_ps5gnQ9rlp4xSCl6"
      },
      body: JSON.stringify({
        siteKey: "key_ps5gnQ9rlp4xSCl6",
        messages: chatHistory.slice(-20)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The chatbot request failed.");

    thinkingBubble.textContent = data.answer;
    chatHistory.push({ role: "assistant", content: data.answer });
  } catch (error) {
    thinkingBubble.textContent = error.message || "Something went wrong. Please try again.";
    thinkingBubble.style.color = "#b42318";
  } finally {
    chatSend.disabled = false;
    chatSend.textContent = "Send";
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

for (const id of ["answer1", "answer2", "markscheme"]) {
  document.getElementById(id).addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    document.getElementById(`${id}-name`).textContent = file ? `Selected: ${file.name}` : "";
  });
}

const correctionForm = document.getElementById("correction-form");
const correctionStatus = document.getElementById("correction-status");
const correctionButton = document.getElementById("correct-button");
const correctionResults = document.getElementById("correction-results");

function setStatus(message, isError = false) {
  correctionStatus.textContent = message;
  correctionStatus.classList.add("show");
  correctionStatus.classList.toggle("error", isError);
}

function addTranscript(label, text) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `${label} — full OCR transcription`;
  const pre = document.createElement("pre");
  pre.className = "result-text";
  pre.textContent = text;
  details.append(summary, pre);
  return details;
}

correctionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const answer1 = document.getElementById("answer1").files[0];
  const answer2 = document.getElementById("answer2").files[0];
  const markscheme = document.getElementById("markscheme").files[0];

  if (!answer1 || !markscheme) {
    setStatus("Please upload Answer Paper 1 and the Mark Scheme PDF. Answer Paper 2 is optional.", true);
    return;
  }

  for (const file of [answer1, answer2, markscheme].filter(Boolean)) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus(`${file.name} is not a PDF file.`, true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus(`${file.name} is larger than 15 MB.`, true);
      return;
    }
  }

  const formData = new FormData();
  formData.append("answer1", answer1);
  if (answer2) formData.append("answer2", answer2);
  formData.append("markscheme", markscheme);

  correctionButton.disabled = true;
  correctionButton.textContent = "Processing…";
  correctionResults.classList.remove("show");
  setStatus("Step 1 of 3: Uploading your PDFs and reading every page. Handwriting and diagram labels are checked by the vision-capable model. This can take a little while for long papers.");

  try {
    const response = await fetch("/api/correct", {
      method: "POST",
      headers: { "x-site-key": "key_ps5gnQ9rlp4xSCl6" },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Paper correction failed.");

    setStatus("Step 2 of 3: Transcription complete. Step 3 of 3: Marking and independently checking the marks are complete.");
    document.getElementById("result-notice").textContent = data.notice;
    document.getElementById("marking-output").textContent = data.marking;
    document.getElementById("audit-output").textContent = data.audit;

    const transcriptOutputs = document.getElementById("transcript-outputs");
    transcriptOutputs.replaceChildren();
    for (const item of data.transcripts || []) {
      transcriptOutputs.appendChild(addTranscript(item.label, item.text));
    }

    correctionResults.classList.add("show");
    setStatus("Done. Review the marking report, independent verification, and full transcriptions below. Check any uncertain handwriting against your original PDFs.");
    correctionResults.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message || "Something went wrong. Please try again.", true);
  } finally {
    correctionButton.disabled = false;
    correctionButton.textContent = "Transcribe & correct papers";
  }
});
