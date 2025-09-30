async function ankiInvoke(action, params = {}) {
  try {
    const res = await fetch("http://127.0.0.1:8765", {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
      headers: { "Content-Type": "application/json" },
    });
    return await res.json();
  } catch (err) {
    document.getElementById("status").innerText =
      "Failed to connect to Anki API";
    throw err;
  }
}

// 設定をlocalStorageに保存する関数
function saveSettings() {
  const settings = {
    deck: document.getElementById("deckSelect").value,
    model: document.getElementById("modelSelect").value,
    frontField: document.getElementById("frontField").value,
    backField: document.getElementById("backField").value,
  };
  localStorage.setItem("ankiExporterSettings", JSON.stringify(settings));
}

// 設定をlocalStorageから読み込む関数
function loadSettings() {
  const savedSettings = localStorage.getItem("ankiExporterSettings");
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);

    // 値が存在する場合のみ設定を適用
    if (
      settings.deck &&
      document
        .getElementById("deckSelect")
        .querySelector(`option[value="${settings.deck}"]`)
    ) {
      document.getElementById("deckSelect").value = settings.deck;
    }
    if (
      settings.model &&
      document
        .getElementById("modelSelect")
        .querySelector(`option[value="${settings.model}"]`)
    ) {
      document.getElementById("modelSelect").value = settings.model;
      // モデルが変更されたのでフィールドを更新
      updateFields(settings.model);
    }
    if (
      settings.frontField &&
      document
        .getElementById("frontField")
        .querySelector(`option[value="${settings.frontField}"]`)
    ) {
      document.getElementById("frontField").value = settings.frontField;
    }
    if (
      settings.backField &&
      document
        .getElementById("backField")
        .querySelector(`option[value="${settings.backField}"]`)
    ) {
      document.getElementById("backField").value = settings.backField;
    }
  }
}

// Anki API接続確認
async function checkAnkiConnection() {
  try {
    document.getElementById("status").innerText = "Checking Anki connection...";
    const result = await ankiInvoke("version");
    if (result && result.result) {
      document.getElementById("status").innerText =
        "Connected to Anki (API version: " + result.result + ")";
      return true;
    } else {
      document.getElementById("status").innerText =
        "Anki API responded but with unexpected data";
      return false;
    }
  } catch (err) {
    // エラーメッセージはankiInvoke関数内で設定済み
    return false;
  }
}

// Load Decks and Models
(async function () {
  try {
    // まずAnki接続を確認
    const isConnected = await checkAnkiConnection();
    if (!isConnected) return;

    const decks = await ankiInvoke("deckNames");
    const models = await ankiInvoke("modelNames");

    const deckSelect = document.getElementById("deckSelect");
    decks.result.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.innerText = d;
      deckSelect.appendChild(opt);
    });

    const modelSelect = document.getElementById("modelSelect");
    models.result.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.innerText = m;
      modelSelect.appendChild(opt);
    });

    // 設定を読み込む
    loadSettings();

    // Update fields when model changes
    modelSelect.addEventListener("change", () => {
      updateFields(modelSelect.value);
      saveSettings(); // 設定を保存
    });

    // 各select要素に変更イベントリスナーを追加
    deckSelect.addEventListener("change", saveSettings);
    document
      .getElementById("frontField")
      .addEventListener("change", saveSettings);
    document
      .getElementById("backField")
      .addEventListener("change", saveSettings);

    // 初期フィールド更新
    updateFields(modelSelect.value);
  } catch (e) {
    // Error already shown by ankiInvoke
  }
})();

// Update field selects
async function updateFields(modelName) {
  try {
    const fields = await ankiInvoke("modelFieldNames", { modelName });
    const frontField = document.getElementById("frontField");
    const backField = document.getElementById("backField");
    frontField.innerHTML = "";
    backField.innerHTML = "";
    fields.result.forEach((f) => {
      const opt1 = document.createElement("option");
      opt1.value = f;
      opt1.innerText = f;
      frontField.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = f;
      opt2.innerText = f;
      backField.appendChild(opt2);
    });

    // 設定を読み込んでフィールドの値を設定
    const savedSettings = localStorage.getItem("ankiExporterSettings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (
        settings.frontField &&
        frontField.querySelector(`option[value="${settings.frontField}"]`)
      ) {
        frontField.value = settings.frontField;
      }
      if (
        settings.backField &&
        backField.querySelector(`option[value="${settings.backField}"]`)
      ) {
        backField.value = settings.backField;
      }
    }
  } catch (err) {
    document.getElementById("status").innerText = "Failed to load fields";
  }
}

// Add card button
document.getElementById("addCard").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: collectQuestions,
    },
    async (injectionResults) => {
      const data = injectionResults[0].result;

      if (!data || data.length === 0) {
        document.getElementById("status").innerText = "No questions found";
        return;
      }

      try {
        for (let item of data) {
          await ankiInvoke("addNote", {
            note: {
              deckName: document.getElementById("deckSelect").value,
              modelName: document.getElementById("modelSelect").value,
              fields: {
                [document.getElementById("frontField").value]: item.question,
                [document.getElementById("backField").value]: item.feedback,
              },
              options: { allowDuplicate: false },
              tags: ["test-english"],
            },
          });
        }
        document.getElementById("status").innerText =
          "Cards added successfully";
      } catch (e) {
        // Error already shown by ankiInvoke
      }
    },
  );
});

// Extract data from page

function collectQuestions() {
  const questions = document.querySelectorAll(".show-question-content");
  const result = [];

  questions.forEach((question) => {
    const answer = question.parentElement.querySelector(
      ".show-question-choices",
    );

    // Correct 判定
    const hasCorrectImg = question.querySelector('img[alt="Correct"]');
    const hasCorrectAnswer = answer?.querySelector(
      "li.user-answer.correct-answer",
    );
    const answers = answer?.querySelectorAll("span.answer");
    // li の class が user-answer correct-answer だから ul じゃなくて li を指定した方が確実

    if (hasCorrectImg || hasCorrectAnswer) {
      return;
    }

    let qText = "";
    question.childNodes.forEach((node) => {
      if (node.className === "user-answer wrong-gap-answer") {
        qText += `"${node.textContent.trim()}" `;
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.tagName === "SPAN"
      ) {
        qText += node.textContent.trim() + " ";
      } else if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t) qText += t + " ";
      }
    });
    if (answers && answers.length > 0) {
      answers.forEach((ans) => {
        qText += `<br>"${ans.textContent.trim()}" `;
      });
    }
    let feedbackEl =
      question.parentElement.querySelector(
        ".watupro-main-feedback.feedback-incorrect",
      ) || question.parentElement.querySelector(".watupro-main-feedback");

    let feedbackText = feedbackEl ? feedbackEl.innerText.trim() : "";

    result.push({
      question: `Q: ${qText.trim()}`,
      feedback: `Feedback: ${feedbackText}`,
    });
  });

  return result;
}
