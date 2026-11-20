/* Yardstick assistant: a chatbot shared by every page.
   It answers from a built in knowledge base about Yardstick and rental investing,
   runs deal math when you type numbers, and can optionally call a hosted LLM. */
(function () {
  // Set to false to keep the bot fully local (no outside requests).
  var USE_LLM = true;
  var LLM_URL = "https://text.pollinations.ai/openai";
  var LLM_TIMEOUT_MS = 9000;

  var SYSTEM_PROMPT =
    "You are the Yardstick assistant on the Yardstick website. Yardstick is an AI tool that helps small real estate investors " +
    "(people who own or want to buy 1 to 20 rental units) underwrite a rental property in minutes. A user pastes a listing link or address; " +
    "Yardstick pulls the listing, estimates market rent from comparable rentals, estimates taxes, insurance, vacancy and repairs, " +
    "and returns cap rate, monthly cash flow, cash on cash return, DSCR and a plain English verdict against the investor's own target. " +
    "It also saves deals to a pipeline and drafts offer notes. Plans: Starter is free (5 deals a month), Investor is $29 a month (unlimited deals, " +
    "rent comps, saved pipeline), Pro is $79 a month (team seats, portfolio tracking, lender ready PDF reports). It is a student project concept, so it is not live yet; " +
    "visitors can try the live Deal Analyzer on the home page. Keep every answer under 90 words, friendly and practical. You can explain real estate investing terms. " +
    "Never give personalized legal, tax or financial advice; suggest a professional for that.";

  var KB = [
    { k: ["what is yardstick", "what do you do", "what does yardstick", "what is this", "about", "explain yardstick", "who are you"],
      a: "Yardstick is an AI underwriting tool for small real estate investors. Paste a listing link or address and it estimates rent, expenses and financing, then gives you cap rate, cash flow, cash on cash return and a plain English verdict in about two minutes." },
    { k: ["how does it work", "how it works", "process", "steps", "use it"],
      a: "Four steps: 1) paste a listing link or address, 2) Yardstick pulls the property details and comparable rents, 3) it fills in taxes, insurance, vacancy, repairs and your loan terms, 4) you get the numbers and a verdict against your target return. You can adjust any assumption and the numbers update instantly." },
    { k: ["price", "pricing", "cost", "how much", "plan", "plans", "subscription", "free"],
      a: "Starter is free and covers 5 deals a month. Investor is $29 a month for unlimited deals, rent comps and a saved deal pipeline. Pro is $79 a month and adds team seats, portfolio tracking and lender ready PDF reports." },
    { k: ["who is it for", "who for", "target", "customer", "beginner", "small investor"],
      a: "It is built for small investors: people buying their first rental up to owners of about 20 units. If you underwrite deals in a spreadsheet at night after work, Yardstick is for you." },
    { k: ["cap rate", "capitalization"],
      a: "Cap rate = net operating income / purchase price. NOI is yearly rent after vacancy minus operating expenses (not the mortgage). Example: $18,000 NOI on a $250,000 house is a 7.2% cap rate. It lets you compare properties without financing." },
    { k: ["cash on cash", "coc", "cash-on-cash"],
      a: "Cash on cash return = yearly cash flow after the mortgage / total cash you put in (down payment plus closing costs). If you invest $60,000 and clear $4,800 a year, that is 8%. Many small investors target 8% to 12%." },
    { k: ["noi", "net operating income"],
      a: "Net operating income is yearly rent, minus vacancy, minus operating expenses like taxes, insurance, repairs and management. It does not include your mortgage payment." },
    { k: ["dscr", "debt service"],
      a: "DSCR (debt service coverage ratio) = NOI / yearly mortgage payments. Lenders usually want 1.2 or higher, meaning the property earns 20% more than the loan costs." },
    { k: ["1% rule", "one percent", "1 percent"],
      a: "The 1% rule is a quick screen: monthly rent should be at least 1% of the purchase price ($2,500 rent on a $250,000 house). It is a filter, not an answer, because taxes and insurance vary a lot by market. Yardstick runs the full numbers instead." },
    { k: ["cash flow", "cashflow"],
      a: "Monthly cash flow is what is left after rent minus vacancy, operating expenses and the mortgage payment. Positive cash flow means the property pays you every month." },
    { k: ["vacancy"],
      a: "Vacancy is the share of the year a unit sits empty. Yardstick uses local data, but 5% to 8% is a common starting assumption for single family rentals." },
    { k: ["rent estimate", "comps", "comparable", "market rent", "how do you know rent"],
      a: "Yardstick estimates market rent from comparable rentals nearby with similar beds, baths and size, and shows you the comps it used so you can judge them yourself." },
    { k: ["accurate", "accuracy", "trust", "reliable"],
      a: "Every number is shown with the assumption behind it, and you can edit any of them. Yardstick is a fast first pass that helps you decide which deals deserve a closer look, not a replacement for inspections or a professional." },
    { k: ["calculator", "analyzer", "try", "demo"],
      a: "Scroll to the Deal Analyzer on the home page. Change the price, rent or expenses and the verdict and gauge update live. You can also type something like \"price 250000 rent 2200\" here and I will run it." },
    { k: ["waitlist", "sign up", "signup", "join", "launch", "available", "download"],
      a: "Yardstick is a concept in development, so it is not available to download yet. You can try a working piece of it today: the Deal Analyzer on the home page." },
    { k: ["data", "privacy", "secure", "security"],
      a: "Your deals stay private to your account. Yardstick never sells your data or shares the properties you are looking at." },
    { k: ["brrrr", "flip", "short term", "airbnb", "str"],
      a: "Yardstick v1 focuses on long term buy and hold rentals. BRRRR and short term rental models are on the roadmap." },
    { k: ["hello", "hi", "hey", "good morning", "good evening"],
      a: "Hi! I am the Yardstick assistant. Ask me how Yardstick works, about pricing, or what terms like cap rate mean. Or type a deal like \"price 250000 rent 2200\" and I will run the numbers." },
    { k: ["thank", "thanks", "appreciate"],
      a: "You are welcome. Anything else you want to run?" }
  ];

  var FALLBACK = "I can help with how Yardstick works, pricing, who it is for, and investing terms like cap rate, cash on cash return or DSCR. You can also type a deal like \"price 250000 rent 2200\" and I will run it.";

  function money(n) {
    var s = Math.round(Math.abs(n)).toLocaleString("en-US");
    return (n < 0 ? "-$" : "$") + s;
  }

  // Detects "price 250000 rent 2200" style messages and runs the deal.
  function dealFromText(t) {
    var clean = t.toLowerCase().replace(/,/g, "");
    var num = function (re) {
      var m = clean.match(re);
      if (!m) return null;
      var v = parseFloat(m[1]);
      if (/k\b/.test(m[0])) v *= 1000;
      return v;
    };
    var price = num(/(?:price|buy|purchase|for|at|costs?)\D{0,6}\$?\s*([\d.]+)\s*k?\b/);
    var rent = num(/rent\D{0,6}\$?\s*([\d.]+)\s*k?\b/);
    if (!price || !rent || price < 10000) return null;
    var down = num(/([\d.]+)\s*%\s*down/) || 25;
    var rate = num(/([\d.]+)\s*%\s*(?:rate|interest)/) || 7;
    var exp = num(/(?:expenses?|costs)\D{0,6}\$?\s*([\d.]+)/);
    if (!exp) exp = Math.round(price * 0.02 / 12 + rent * 0.10);
    var r = window.YardstickMath.run({ price: price, downPct: down, ratePct: rate, rent: rent, expenses: exp, vacancyPct: 6 });
    return "Here is the quick read on that deal (" + down + "% down, " + rate + "% rate, " + money(exp) + "/mo expenses, 6% vacancy):\n" +
      "Cap rate: " + r.capRate.toFixed(1) + "%\n" +
      "Monthly cash flow: " + money(r.monthlyCF) + "\n" +
      "Cash on cash return: " + r.coc.toFixed(1) + "%\n" +
      "Cash needed: " + money(r.cashIn) + "\n" +
      (r.coc >= 8 ? "That clears an 8% target." : r.coc >= 0 ? "Positive, but under an 8% target." : "This one loses money at these numbers.");
  }

  function localAnswer(text) {
    var t = text.toLowerCase();
    var best = null, bestScore = 0;
    KB.forEach(function (item) {
      item.k.forEach(function (key) {
        var re = new RegExp("(^|[^a-z])" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)");
        if (re.test(t) && key.length > bestScore) { best = item; bestScore = key.length; }
      });
    });
    return best ? best.a : null;
  }

  var history = [];

  function askLLM(text) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, LLM_TIMEOUT_MS);
    var msgs = [{ role: "system", content: SYSTEM_PROMPT }].concat(history.slice(-8));
    return fetch(LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai", messages: msgs, private: true }),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("status " + res.status);
      return res.json();
    }).then(function (data) {
      var out = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!out || out.length < 2) throw new Error("empty");
      // Drop anything after a sponsor or ad marker some free endpoints append.
      out = out.split(/\n\s*(?:---|\*\*sponsor|sponsor:|ad:)/i)[0].trim();
      return out;
    });
  }

  function reply(text) {
    var deal = dealFromText(text);
    if (deal) return Promise.resolve(deal);
    var local = localAnswer(text);
    if (local) return Promise.resolve(local);
    if (!USE_LLM) return Promise.resolve(FALLBACK);
    return askLLM(text).catch(function () { return FALLBACK; });
  }

  // UI
  var html =
    '<button class="chat-launch" type="button" aria-expanded="false" aria-controls="ys-chat">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
    '<span>Ask Yardstick</span></button>' +
    '<div class="chat-panel" id="ys-chat" role="dialog" aria-label="Yardstick assistant">' +
    '<div class="chat-head"><div><strong>Yardstick assistant</strong><small>Ask about the product or run a deal</small></div>' +
    '<button class="chat-close" type="button" aria-label="Close chat">&times;</button></div>' +
    '<div class="chat-log" aria-live="polite"></div>' +
    '<div class="chips"></div>' +
    '<form class="chat-form"><input type="text" placeholder="Type a question or a deal" aria-label="Message" autocomplete="off" /><button type="submit">Send</button></form>' +
    '</div>';
  var holder = document.createElement("div");
  holder.innerHTML = html;
  while (holder.firstChild) document.body.appendChild(holder.firstChild);

  var launch = document.querySelector(".chat-launch");
  var panel = document.getElementById("ys-chat");
  var log = panel.querySelector(".chat-log");
  var form = panel.querySelector(".chat-form");
  var input = form.querySelector("input");
  var chips = panel.querySelector(".chips");

  function add(text, who) {
    var d = document.createElement("div");
    d.className = "msg " + who;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function send(text) {
    text = text.trim();
    if (!text) return;
    add(text, "user");
    history.push({ role: "user", content: text });
    input.value = "";
    var typing = add("Thinking...", "bot typing");
    reply(text).then(function (ans) {
      typing.remove();
      add(ans, "bot");
      history.push({ role: "assistant", content: ans });
    });
  }

  ["How does it work?", "Pricing", "What is cap rate?", "price 250000 rent 2200"].forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = c;
    b.addEventListener("click", function () { send(c); });
    chips.appendChild(b);
  });

  var greeted = false;
  function toggle(open) {
    panel.classList.toggle("open", open);
    launch.setAttribute("aria-expanded", String(open));
    if (open) {
      if (!greeted) {
        add("Hi! I am the Yardstick assistant. Ask me how Yardstick works, about pricing, or any rental investing term. You can also type a deal like \"price 250000 rent 2200\" and I will run the numbers.", "bot");
        greeted = true;
      }
      input.focus();
    }
  }
  launch.addEventListener("click", function () { toggle(!panel.classList.contains("open")); });
  panel.querySelector(".chat-close").addEventListener("click", function () { toggle(false); launch.focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) toggle(false); });
  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
})();
