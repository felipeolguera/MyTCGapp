interface QuantityPadProps {
  value: string;
  onChange: (next: string) => void;
  onSaveNext: () => void;
  saving?: boolean;
  disabled?: boolean;
}

export function QuantityPad({
  value,
  onChange,
  onSaveNext,
  saving,
  disabled,
}: QuantityPadProps) {
  function press(digit: string) {
    if (disabled || saving) return;
    if (value.length >= 3) return;
    if (value === "0") {
      onChange(digit);
      return;
    }
    onChange(value + digit);
  }

  function backspace() {
    if (disabled || saving) return;
    onChange(value.length <= 1 ? "0" : value.slice(0, -1));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "go"];

  return (
    <div className="qty-sheet" role="dialog" aria-label="Enter quantity">
      <div className="qty-sheet__display">
        <span className="qty-sheet__label">Quantity</span>
        <span className="qty-sheet__value" data-testid="quantity-value">
          {value}
        </span>
      </div>
      <div className="qty-sheet__grid">
        {keys.map((key) => {
          if (key === "⌫") {
            return (
              <button
                key={key}
                type="button"
                className="qty-key"
                onClick={backspace}
                disabled={disabled || saving}
                aria-label="Backspace"
              >
                ⌫
              </button>
            );
          }
          if (key === "go") {
            return (
              <button
                key={key}
                type="button"
                className="qty-key qty-key--save"
                onClick={onSaveNext}
                disabled={disabled || saving || value === "0"}
                data-testid="save-next"
              >
                {saving ? "Saving…" : "Save & Next"}
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              className="qty-key"
              onClick={() => press(key)}
              disabled={disabled || saving}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
