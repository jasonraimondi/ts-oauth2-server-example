describe("template spec", () => {
  it("passes", () => {
    cy.visit("/ping");

    cy.contains("pong");
  });
});
