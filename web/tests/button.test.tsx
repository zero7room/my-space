import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a shadcn-style button", () => {
    render(<Button>提醒验证</Button>);

    expect(screen.getByRole("button", { name: "提醒验证" })).toBeInTheDocument();
  });
});
