import { describe, it, expect } from "vitest";
import { containsLatex, renderLatex, convertLatexToUnicode } from "./latex-utils";

describe("latex-utils", () => {
  // -----------------------------------------------------------------------
  // containsLatex
  // -----------------------------------------------------------------------
  describe("containsLatex", () => {
    describe("given text with inline dollar-sign math", () => {
      it("should detect LaTeX", () => {
        expect(containsLatex("The formula is $x^2$ here")).toBe(true);
      });
    });

    describe("given text with display dollar-sign math", () => {
      it("should detect LaTeX", () => {
        expect(containsLatex("Look: $$E = mc^2$$")).toBe(true);
      });
    });

    describe("given text with inline paren delimiters", () => {
      it("should detect LaTeX", () => {
        expect(containsLatex("The value is \\(x + 1\\) here")).toBe(true);
      });
    });

    describe("given text with display bracket delimiters", () => {
      it("should detect LaTeX", () => {
        expect(containsLatex("Formula: \\[a^2 + b^2 = c^2\\]")).toBe(true);
      });
    });

    describe("given plain text without math", () => {
      it("should return false", () => {
        expect(containsLatex("Hello, world! No math here.")).toBe(false);
      });
    });

    describe("given text with a single dollar sign (not math)", () => {
      it("should return false for $100", () => {
        // A single dollar followed by digits with no closing $ on the same line isn't matched
        expect(containsLatex("The price is $100")).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // convertLatexToUnicode
  // -----------------------------------------------------------------------
  describe("convertLatexToUnicode", () => {
    describe("given \\frac{1}{2}", () => {
      it("should render as 1/2", () => {
        expect(convertLatexToUnicode("\\frac{1}{2}")).toBe("1/2");
      });
    });

    describe("given \\frac{a+b}{c}", () => {
      it("should render as (a+b)/c", () => {
        expect(convertLatexToUnicode("\\frac{a+b}{c}")).toBe("a+b/c");
      });
    });

    describe("given \\sqrt{4}", () => {
      it("should render with square root symbol", () => {
        expect(convertLatexToUnicode("\\sqrt{4}")).toBe("\u221A4");
      });
    });

    describe("given \\sqrt{x+1}", () => {
      it("should render with square root symbol", () => {
        expect(convertLatexToUnicode("\\sqrt{x+1}")).toBe("\u221Ax+1");
      });
    });

    describe("given x^{2}", () => {
      it("should render with superscript 2", () => {
        expect(convertLatexToUnicode("x^{2}")).toBe("x\u00B2");
      });
    });

    describe("given x^2 (single char)", () => {
      it("should render with superscript 2", () => {
        expect(convertLatexToUnicode("x^2")).toBe("x\u00B2");
      });
    });

    describe("given x_{i}", () => {
      it("should render with subscript i", () => {
        expect(convertLatexToUnicode("x_{i}")).toBe("x\u1D62");
      });
    });

    describe("given x_i (single char)", () => {
      it("should render with subscript i", () => {
        expect(convertLatexToUnicode("x_i")).toBe("x\u1D62");
      });
    });

    describe("given common Greek letters", () => {
      it("should convert \\alpha to alpha unicode", () => {
        expect(convertLatexToUnicode("\\alpha")).toBe("\u03B1");
      });

      it("should convert \\beta to beta unicode", () => {
        expect(convertLatexToUnicode("\\beta")).toBe("\u03B2");
      });

      it("should convert \\pi to pi unicode", () => {
        expect(convertLatexToUnicode("\\pi")).toBe("\u03C0");
      });

      it("should convert \\Omega to uppercase omega unicode", () => {
        expect(convertLatexToUnicode("\\Omega")).toBe("\u03A9");
      });

      it("should convert \\theta to theta unicode", () => {
        expect(convertLatexToUnicode("\\theta")).toBe("\u03B8");
      });
    });

    describe("given common operator symbols", () => {
      it("should convert \\sum to summation sign", () => {
        expect(convertLatexToUnicode("\\sum")).toBe("\u2211");
      });

      it("should convert \\int to integral sign", () => {
        expect(convertLatexToUnicode("\\int")).toBe("\u222B");
      });

      it("should convert \\infty to infinity sign", () => {
        expect(convertLatexToUnicode("\\infty")).toBe("\u221E");
      });

      it("should convert \\leq to less-than-or-equal sign", () => {
        expect(convertLatexToUnicode("\\leq")).toBe("\u2264");
      });

      it("should convert \\rightarrow to arrow", () => {
        expect(convertLatexToUnicode("\\rightarrow")).toBe("\u2192");
      });
    });

    describe("given a complex expression", () => {
      it("should convert E = mc^2 correctly", () => {
        const result = convertLatexToUnicode("E = mc^2");
        expect(result).toBe("E = mc\u00B2");
      });

      it("should convert \\sum_{i=0}^{n} with sub and superscripts", () => {
        const result = convertLatexToUnicode("\\sum_{i=0}^{n}");
        // sum symbol + subscript i=0 + superscript n
        expect(result).toContain("\u2211");
        expect(result).toContain("\u1D62");
        expect(result).toContain("\u207F");
      });
    });

    describe("given \\text{...}", () => {
      it("should strip the command and keep text", () => {
        expect(convertLatexToUnicode("\\text{hello}")).toBe("hello");
      });
    });
  });

  // -----------------------------------------------------------------------
  // renderLatex
  // -----------------------------------------------------------------------
  describe("renderLatex", () => {
    describe("given inline math with dollar signs", () => {
      it("should wrap in a styled span", () => {
        const result = renderLatex("The value $x^2$ is here");
        expect(result).toContain('class="latex-math font-serif italic"');
        expect(result).toContain("x\u00B2");
        expect(result).toContain("The value");
        expect(result).toContain("is here");
      });
    });

    describe("given display math with double dollar signs", () => {
      it("should wrap in a display styled span", () => {
        const result = renderLatex("Formula: $$\\frac{1}{2}$$");
        expect(result).toContain("latex-display");
        expect(result).toContain("1/2");
      });
    });

    describe("given text with no LaTeX", () => {
      it("should return text unchanged", () => {
        const input = "Hello, world!";
        expect(renderLatex(input)).toBe(input);
      });
    });

    describe("given inline paren delimiters", () => {
      it("should render and wrap properly", () => {
        const result = renderLatex("See \\(\\alpha + \\beta\\) now");
        expect(result).toContain("\u03B1");
        expect(result).toContain("\u03B2");
        expect(result).toContain('class="latex-math font-serif italic"');
      });
    });

    describe("given display bracket delimiters", () => {
      it("should render as display block", () => {
        const result = renderLatex("Result: \\[E = mc^2\\]");
        expect(result).toContain("latex-display");
        expect(result).toContain("mc\u00B2");
      });
    });

    describe("given HTML special characters in math", () => {
      it("should escape them properly", () => {
        const result = renderLatex("$a < b$");
        expect(result).toContain("&lt;");
        expect(result).not.toContain("<b>");
      });
    });
  });
});
