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

function escapeHtml(raw) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(line) {
  return escapeHtml(line)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderAssistantMessage(rawText) {
  const lines = String(rawText ?? "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let inList = null;
  let inCode = false;
  let codeLines = [];

  function closeList() {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const tag = heading[1].length <= 2 ? "h3" : "h4";
      output.push(`<${tag}>${renderInlineMarkdown(heading[2])}</${tag}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const targetList = bullet ? "ul" : "ol";
      if (inList !== targetList) {
        closeList();
        output.push(`<${targetList}>`);
        inList = targetList;
      }
      output.push(`<li>${renderInlineMarkdown((bullet || numbered)[1])}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (inCode && codeLines.length) {
    output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return output.join("") || "<p></p>";
}

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
  if (role === "assistant") {
    bubble.innerHTML = renderAssistantMessage(text);
  } else {
    bubble.textContent = text;
  }
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

    thinkingBubble.innerHTML = renderAssistantMessage(data.answer);
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

function displayValue(value, fallback = "Not provided") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value);
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function renderMarkingReport(report, audit) {
  if (typeof report === "string") {
    document.getElementById("score-number").textContent = "Report Ready";
    document.getElementById("score-percent").textContent = "—";
    document.getElementById("score-summary").textContent = "See detailed marking report below.";
    document.getElementById("question-list").innerHTML = `<div class="item-card"><pre class="result-text">${escapeHtml(report)}</pre></div>`;
    document.getElementById("mistakes-list").innerHTML = "";
    document.getElementById("correct-answers-list").innerHTML = "";
    document.getElementById("notes-summary-list").innerHTML = "";
    document.getElementById("audit-output").innerHTML = `<div class="item-card"><pre class="result-text">${escapeHtml(typeof audit === "string" ? audit : JSON.stringify(audit, null, 2))}</pre></div>`;
    return;
  }

  const mark = formatNumber(report?.overall_mark);
  const max = formatNumber(report?.maximum_mark);
  const percent = typeof report?.percentage === "number" && Number.isFinite(report.percentage)
    ? `${Math.round(report.percentage)}%`
    : "—";

  document.getElementById("score-number").textContent =
    mark !== null && max !== null ? `${mark} / ${max}` : mark !== null ? mark : "See breakdown";
  document.getElementById("score-percent").textContent = percent;
  document.getElementById("score-summary").textContent = displayValue(
    report?.summary,
    "Completed structured marking against the official mark scheme."
  );

  const qContainer = document.getElementById("question-list");
  qContainer.replaceChildren();
  const questions = Array.isArray(report?.question_breakdown) ? report.question_breakdown : [];
  if (questions.length === 0) {
    qContainer.innerHTML = `<div class="item-card"><div class="field-row">No individual questions were identified.</div></div>`;
  } else {
    for (const q of questions) {
      const card = document.createElement("div");
      card.className = "item-card";
      const awarded = formatNumber(q.awarded_marks);
      const qMax = formatNumber(q.maximum_marks);
      const scoreLabel = awarded !== null && qMax !== null ? `${awarded} / ${qMax}` : "Marks N/A";
      const status = q.status || "unclear";
      card.innerHTML = `
        <div class="item-head">
          <span class="item-title">${escapeHtml(displayValue(q.question, "Question"))} · ${escapeHtml(scoreLabel)}</span>
          <span class="status-chip ${escapeHtml(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>
        </div>
        <div class="field-row"><strong>Student evidence:</strong> ${escapeHtml(displayValue(q.student_evidence))}</div>
        <div class="field-row"><strong>Marking decision:</strong> ${escapeHtml(displayValue(q.marking_decision))}</div>
        <div class="field-row"><strong>Improvement:</strong> ${escapeHtml(displayValue(q.improvement))}</div>
      `;
      qContainer.appendChild(card);
    }
  }

  const mContainer = document.getElementById("mistakes-list");
  mContainer.replaceChildren();
  const mistakes = Array.isArray(report?.mistakes) ? report.mistakes : [];
  if (mistakes.length === 0) {
    mContainer.innerHTML = `<div class="item-card"><div class="field-row">No specific mistakes or lost-mark items were flagged.</div></div>`;
  } else {
    for (const m of mistakes) {
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <div class="item-head">
          <span class="item-title">${escapeHtml(displayValue(m.question, "Question"))}</span>
          <span class="status-chip incorrect">Lost mark</span>
        </div>
        <div class="field-row"><strong>Mistake:</strong> ${escapeHtml(displayValue(m.mistake))}</div>
        <div class="field-row"><strong>Why marks were lost:</strong> ${escapeHtml(displayValue(m.why_marks_lost))}</div>
        <div class="field-row"><strong>How to fix:</strong> ${escapeHtml(displayValue(m.fix))}</div>
      `;
      mContainer.appendChild(card);
    }
  }

  const cContainer = document.getElementById("correct-answers-list");
  cContainer.replaceChildren();
  const comparisons = Array.isArray(report?.correct_answers) ? report.correct_answers : [];
  if (comparisons.length === 0) {
    cContainer.innerHTML = `<div class="item-card"><div class="field-row">No model answer comparisons available.</div></div>`;
  } else {
    for (const c of comparisons) {
      const card = document.createElement("div");
      card.className = "item-card";
      const points = Array.isArray(c.mark_scheme_points) ? c.mark_scheme_points : [];
      const pointsHtml = points.length
        ? `<ul class="bullet-list">${points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
        : `<div class="field-row">None listed</div>`;
      card.innerHTML = `
        <div class="item-head">
          <span class="item-title">${escapeHtml(displayValue(c.question, "Question"))}</span>
        </div>
        <div class="comparison-grid">
          <div class="comparison-box">
            <h5>Student's Answer</h5>
            <div>${escapeHtml(displayValue(c.student_answer))}</div>
          </div>
          <div class="comparison-box">
            <h5>Model Answer</h5>
            <div>${escapeHtml(displayValue(c.model_answer))}</div>
          </div>
        </div>
        <div class="field-row" style="margin-top:10px;"><strong>Mark scheme points:</strong>${pointsHtml}</div>
        <div class="field-row"><strong>Comparison:</strong> ${escapeHtml(displayValue(c.comparison))}</div>
      `;
      cContainer.appendChild(card);
    }
  }

  const notesContainer = document.getElementById("notes-summary-list");
  notesContainer.replaceChildren();
  const groups = [
    ["Strengths", report?.strengths],
    ["Questions / Handwriting Requiring Human Review", report?.review_required],
    ["Marking Notes & Assumptions", report?.marking_notes]
  ];
  for (const [label, items] of groups) {
    const list = Array.isArray(items) && items.length ? items : ["None noted."];
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-title" style="margin-bottom:6px;">${escapeHtml(label)}</div>
      <ul class="bullet-list">${list.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    `;
    notesContainer.appendChild(card);
  }

  const auditContainer = document.getElementById("audit-output");
  if (audit && typeof audit === "object") {
    const vMark = formatNumber(audit.verified_mark);
    const vMax = formatNumber(audit.verified_maximum);
    const vTotal = vMark !== null && vMax !== null ? `${vMark} / ${vMax}` : "Requires human verification";
    const status = audit.audit_status || "human_review";
    const issues = Array.isArray(audit.issues) && audit.issues.length ? audit.issues : ["None"];
    const corrections = Array.isArray(audit.corrections) && audit.corrections.length ? audit.corrections : ["None"];
    auditContainer.innerHTML = `
      <div class="item-card">
        <div class="item-head">
          <span class="item-title">Verified Total: ${escapeHtml(vTotal)}</span>
          <span class="status-chip ${escapeHtml(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>
        </div>
        <div class="field-row"><strong>Arithmetic check:</strong> ${escapeHtml(displayValue(audit.arithmetic_check))}</div>
        <div class="field-row"><strong>Issues flagged:</strong><ul class="bullet-list">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>
        <div class="field-row"><strong>Required corrections:</strong><ul class="bullet-list">${corrections.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>
        <div class="field-row"><strong>Final note:</strong> ${escapeHtml(displayValue(audit.final_note))}</div>
      </div>
    `;
  } else {
    auditContainer.innerHTML = `<div class="item-card"><pre class="result-text">${escapeHtml(displayValue(audit))}</pre></div>`;
  }
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
    renderMarkingReport(data.marking, data.audit);

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
