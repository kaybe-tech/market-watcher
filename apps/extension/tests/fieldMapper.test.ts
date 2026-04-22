import { describe, expect, test } from "bun:test"
import { mapTikrToPayload } from "../src/sources/tikr/fieldMapper"

describe("mapTikrToPayload", () => {
  test("maps income statement rows into incomeStatement", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2023-01-29", "2024-01-28"],
        rows: [
          { label: "Revenues", values: ["26,974.00", "60,922.00"] },
          { label: "Operating Income", values: ["4,224.00", "32,972.00"] },
          { label: "Interest Expense", values: ["(262.00)", "(257.00)"] },
          { label: "Income Tax Expense", values: ["(187.00)", "4,058.00"] },
          {
            label: "Weighted Average Diluted Shares Outstanding",
            values: ["2,507", "2,494"],
          },
        ],
      },
      "millions",
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      fiscalYearEnd: "2023-01-29",
      incomeStatement: {
        sales: 26974,
        ebit: 4224,
        interestExpense: -262,
        taxExpense: -187,
        fullyDilutedShares: 2507,
        depreciationAmortization: 0,
        interestIncome: 0,
        minorityInterests: 0,
      },
    })
    expect(result[1]?.incomeStatement?.sales).toBe(60922)
  })

  test("balance sheet splits into roic and freeCashFlow", () => {
    const result = mapTikrToPayload(
      "balanceSheet",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Cash And Equivalents", values: ["7,280.00"] },
          { label: "Short Term Investments", values: ["18,704.00"] },
          { label: "Long-Term Debt", values: ["8,459.00"] },
          { label: "Total Equity", values: ["42,978.00"] },
          { label: "Inventory", values: ["5,282.00"] },
          { label: "Accounts Payable", values: ["2,699.00"] },
        ],
      },
      "millions",
    )

    expect(result[0]).toEqual({
      fiscalYearEnd: "2024-01-28",
      roic: {
        cashAndEquivalents: 7280,
        marketableSecurities: 18704,
        longTermDebt: 8459,
        equity: 42978,
        shortTermDebt: 0,
        currentOperatingLeases: 0,
        nonCurrentOperatingLeases: 0,
      },
      freeCashFlow: {
        inventories: 5282,
        accountsPayable: 2699,
        accountsReceivable: 0,
        unearnedRevenue: 0,
      },
    })
  })

  test("cash flow contributes capex, dividends y D&A", () => {
    const result = mapTikrToPayload(
      "cashFlowStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Total Depreciation & Amortization", values: ["1,508.00"] },
          { label: "Capital Expenditure", values: ["(1,069.00)"] },
          { label: "Common Dividends Paid", values: ["(395.00)"] },
          { label: "Net Income", values: ["29,760.00"] },
        ],
      },
      "millions",
    )

    expect(result[0]).toEqual({
      fiscalYearEnd: "2024-01-28",
      incomeStatement: {
        depreciationAmortization: 1508,
      },
      freeCashFlow: {
        capexMaintenance: -1069,
        dividendsPaid: -395,
      },
    })
  })

  test("cash flow usa Total D&A con preferencia sobre D&A", () => {
    const result = mapTikrToPayload(
      "cashFlowStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Depreciation & Amortization", values: ["1,200.00"] },
          { label: "Total Depreciation & Amortization", values: ["1,508.00"] },
        ],
      },
      "millions",
    )
    expect(result[0]?.incomeStatement?.depreciationAmortization).toBe(1508)
  })

  test("celdas visualmente vacías y filas ausentes pasan a 0", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2023-01-29"],
        rows: [
          { label: "Revenues", values: ["10,000"] },
          { label: "Minority Interest", values: ["--"] },
          { label: "Interest Expense", values: ["—"] },
        ],
      },
      "millions",
    )

    expect(result[0]).toEqual({
      fiscalYearEnd: "2023-01-29",
      incomeStatement: {
        sales: 10000,
        depreciationAmortization: 0,
        ebit: 0,
        interestExpense: 0,
        interestIncome: 0,
        taxExpense: 0,
        minorityInterests: 0,
        fullyDilutedShares: 0,
      },
    })
  })

  test("normalizes billions to millions", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [{ label: "Revenues", values: ["1.50"] }],
      },
      "billions",
    )
    expect(result[0]?.incomeStatement?.sales).toBe(1500)
  })

  test("prefers first available label when multiple synonyms exist", () => {
    const result = mapTikrToPayload(
      "cashFlowStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Common Dividends Paid", values: ["(100)"] },
          {
            label: "Common & Preferred Stock Dividends Paid",
            values: ["(105)"],
          },
        ],
      },
      "millions",
    )
    expect(result[0]?.freeCashFlow?.dividendsPaid).toBe(-100)
  })

  test("falls back to second label when first is missing", () => {
    const result = mapTikrToPayload(
      "cashFlowStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          {
            label: "Common & Preferred Stock Dividends Paid",
            values: ["(105)"],
          },
        ],
      },
      "millions",
    )
    expect(result[0]?.freeCashFlow?.dividendsPaid).toBe(-105)
  })

  test("case (1): fila ausente en la tabla → campo = 0", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [{ label: "Revenues", values: ["10,000"] }],
      },
      "millions",
    )

    expect(result[0]?.incomeStatement?.minorityInterests).toBe(0)
    expect(result[0]?.incomeStatement?.depreciationAmortization).toBe(0)
    expect(result[0]?.incomeStatement?.ebit).toBe(0)
    expect(result[0]?.incomeStatement?.interestExpense).toBe(0)
    expect(result[0]?.incomeStatement?.interestIncome).toBe(0)
    expect(result[0]?.incomeStatement?.taxExpense).toBe(0)
    expect(result[0]?.incomeStatement?.fullyDilutedShares).toBe(0)
  })

  test("case (2): fila existe pero la celda de esa columna es undefined → campo = 0", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2023-01-29", "2024-01-28"],
        rows: [
          { label: "Revenues", values: ["10,000", "20,000"] },
          { label: "Operating Income", values: ["1,000"] },
        ],
      },
      "millions",
    )

    expect(result[0]?.incomeStatement?.ebit).toBe(1000)
    expect(result[1]?.incomeStatement?.ebit).toBe(0)
  })

  test("case (3) unmeasurable: celda con NM/N/A → campo omitido", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Revenues", values: ["10,000"] },
          { label: "Minority Interest", values: ["NM"] },
          { label: "Operating Income", values: ["N/A"] },
        ],
      },
      "millions",
    )

    expect(result[0]?.incomeStatement?.minorityInterests).toBeUndefined()
    expect(result[0]?.incomeStatement?.ebit).toBeUndefined()
  })

  test("case (3) visual empty: celda vacía o con — → campo = 0", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2024-01-28"],
        rows: [
          { label: "Revenues", values: ["10,000"] },
          { label: "Minority Interest", values: [""] },
          { label: "Operating Income", values: ["—"] },
          { label: "Interest Expense", values: ["--"] },
        ],
      },
      "millions",
    )

    expect(result[0]?.incomeStatement?.minorityInterests).toBe(0)
    expect(result[0]?.incomeStatement?.ebit).toBe(0)
    expect(result[0]?.incomeStatement?.interestExpense).toBe(0)
  })
})
