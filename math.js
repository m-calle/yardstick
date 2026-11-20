/* Shared deal math used by the Deal Analyzer and the chatbot. */
window.YardstickMath = {
  run: function (d) {
    var closingPct = 3, termYears = 30;
    var down = d.price * d.downPct / 100;
    var loan = d.price - down;
    var r = d.ratePct / 100 / 12, n = termYears * 12;
    var mortgage = loan <= 0 ? 0 : (r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n)));
    var effRent = d.rent * (1 - d.vacancyPct / 100);
    var noiMonthly = effRent - d.expenses;
    var noi = noiMonthly * 12;
    var monthlyCF = noiMonthly - mortgage;
    var cashIn = down + d.price * closingPct / 100;
    return {
      mortgage: mortgage,
      noi: noi,
      capRate: d.price > 0 ? noi / d.price * 100 : 0,
      monthlyCF: monthlyCF,
      cashIn: cashIn,
      coc: cashIn > 0 ? monthlyCF * 12 / cashIn * 100 : 0,
      dscr: mortgage > 0 ? noiMonthly / mortgage : Infinity
    };
  }
};
