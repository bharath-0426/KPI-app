describe('API structure', () => {
  it('evaluates scoring status correctly', () => {
    // Test the threshold logic inline
    function evaluateStatus(selfScore, managerScore, threshold = 1) {
      if (selfScore === null || managerScore === null) return null;
      const diff = Math.abs(selfScore - managerScore);
      return diff >= threshold ? 'disputed' : 'reconciled';
    }

    expect(evaluateStatus(3, 3)).toBe('reconciled');
    expect(evaluateStatus(3, 5)).toBe('disputed');
    expect(evaluateStatus(null, 3)).toBe(null);
    expect(evaluateStatus(3, 4)).toBe('disputed');  // diff=1, threshold=1 → disputed
    expect(evaluateStatus(3, 3.5)).toBe('reconciled'); // diff=0.5 < 1
  });

  it('validates distribution sums to 100', () => {
    function validateDistribution(allocations) {
      const total = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return total === 100;
    }

    expect(validateDistribution([{ amount: 60 }, { amount: 40 }])).toBe(true);
    expect(validateDistribution([{ amount: 50 }, { amount: 40 }])).toBe(false);
    expect(validateDistribution([{ amount: 33 }, { amount: 33 }, { amount: 34 }])).toBe(true);
  });
});
