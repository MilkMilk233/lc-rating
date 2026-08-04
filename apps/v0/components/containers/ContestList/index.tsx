import React, { useEffect, useMemo } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Pagination from "react-bootstrap/Pagination";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";

import ContestCell from "./ContestCell";
import ProblemCell from "./ProblemCell";

import {
  Column,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnResizeMode,
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  Table as TTable,
  useReactTable,
} from "@tanstack/react-table";

import { rankItem } from "@tanstack/match-sorter-utils";

import { Contest, useContests } from "@hooks/useContests";
import { useSolutions } from "@hooks/useSolutions";
import useStorage from "@hooks/useStorage";

import Container from "react-bootstrap/esm/Container";

const columnHelper = createColumnHelper<Contest>();

const ratingFilter: FilterFn<Contest> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};

const fuzzyFilter: FilterFn<Contest> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};

function ContestList() {
  const { solutions } = useSolutions();

  const { contests, isPending: loading } = useContests();

  const [size, setSize] = useStorage<string>("__size", {
    defaultValue: "100",
  });

  const [{ pageIndex, pageSize }, setPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: parseInt(size || "100"),
    });

  const [contestsInPage, pageCount] = useMemo(() => {
    return [
      contests.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      Math.ceil(contests.length / pageSize),
    ];
  }, [pageIndex, pageSize, contests]);

  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );

  const [mark, setMark] = useStorage<string>("__mark", {
    defaultValue: "",
  });

  const [selectedRow, setSelectedRow] = React.useState<string>(mark || "");
  const [columnResizeMode, setColumnResizeMode] =
    React.useState<ColumnResizeMode>("onChange");
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnVisibility, setColumnVisibility] = React.useState({});
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const problemColDef = (id: "A" | "B" | "C" | "D") => {
    return columnHelper.accessor((row) => row[id].rating, {
      header: id,
      enableColumnFilter: true,
      size: 365,
      cell: (info) => {
        const question = info.row.original[id];
        return (
          <ProblemCell
            question={question}
            solution={solutions[question._hash]}
          />
        );
      },
      footer: (info) => info.column.id,
    });
  };

  const columns = [
    columnHelper.accessor("Contest", {
      sortingFn: (a, b, id) => {
        return a.original.StartTime - b.original.StartTime;
      },
      header: "Contest",
      enableResizing: false,
      enableSorting: true,
      size: 150,
      enableColumnFilter: false,
      cell: (info) => (
        <ContestCell
          title={info.getValue()}
          titleSlug={info.row.original.TitleSlug}
        />
      ),
      footer: (info) => info.column.id,
    }),
    problemColDef("A"),
    problemColDef("B"),
    problemColDef("C"),
    problemColDef("D"),
  ];

  const table = useReactTable<Contest>({
    data: contestsInPage,
    columns,
    pageCount: pageCount,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnVisibility,
      columnOrder,
      sorting,
      columnFilters,
      globalFilter,
      pagination: { pageIndex, pageSize },
    },
    filterFns: {
      rating: ratingFilter,
      fuzzy: fuzzyFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    manualPagination: true,
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    debugTable: false,
  });

  useEffect(() => {
    if (table.getState().columnFilters[0]?.id === "Contest") {
      if (table.getState().sorting[0]?.id !== "Contest") {
        table.setSorting([{ id: "Contest", desc: false }]);
      }
    }
  }, [table.getState().columnFilters[0]?.id]);

  const renderPagination = () => (
    <div className="pagination-bar">
      <div className="toolbar-group">
        <Pagination>
          <Pagination.First
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          />
          <Pagination.Prev
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          />
          <Pagination.Next
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          />
          <Pagination.Last
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          />
        </Pagination>
        <span className="metric-pill">
          Page{" "}
          <strong>
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(table.getPageCount(), 1)}
          </strong>
        </span>
        <Form.Control
          type="number"
          min={1}
          max={Math.max(table.getPageCount(), 1)}
          value={table.getState().pagination.pageIndex + 1}
          onChange={(e) => {
            const page = e.target.value ? Number(e.target.value) - 1 : 0;
            table.setPageIndex(page);
          }}
          className="compact-input"
          aria-label="跳转页码"
        />
      </div>
      <div className="toolbar-group">
        <span className="text-muted fw-semibold">Rows</span>
        <ButtonGroup aria-label="Page size">
          {[20, 50, 100, 200, 500].map((v) => {
            return (
              <Button
                key={v}
                className={pageSize === v ? "active" : ""}
                onClick={() => {
                  table.setPageSize(Number(v));
                  setSize(`${v}`);
                }}
                variant="outline-secondary"
              >
                {v}
              </Button>
            );
          })}
        </ButtonGroup>
      </div>
    </div>
  );

  return (
    <Container fluid className="contest page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Contest archive</p>
          <h1 className="page-title">竞赛题目评级</h1>
          <p className="page-description">
            冻结的本地题库，按周赛/双周赛浏览 A-D 题的难度和题解。
          </p>
        </div>
        <div className="metric-strip">
          <span className="metric-pill">
            Contests <strong>{contests.length}</strong>
          </span>
          <span className="metric-pill">
            Page size <strong>{pageSize}</strong>
          </span>
        </div>
      </header>
      <div className="data-panel contest-table">
        {renderPagination()}
        <div className="table-scroll">
          <Table hover className="app-table contest-table-grid">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    let hsz = header.getSize();
                    return (
                      <th
                        key={header.id}
                        {...{
                          colSpan: header.colSpan,
                          style: {
                            width: hsz,
                            overflow: "hidden",
                          },
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <div className="d-flex flex-row align-items-center justify-content-center">
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              {...{
                                style: { minWidth: 65 },
                                className: header.column.getCanSort()
                                  ? "cursor-pointer select-none"
                                  : "",
                                onClick:
                                  header.column.getToggleSortingHandler(),
                              }}
                            >
                              {/* {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )} */}
                              <>
                                {{
                                  asc: header.column.columnDef.header + " 🔼",
                                  desc: header.column.columnDef.header + " 🔽",
                                  false: header.column.columnDef.header,
                                }[header.column.getIsSorted() as string] ??
                                  null}
                              </>
                            </Button>
                            {header.column.getCanFilter() ? (
                              <div className="ms-1">
                                <Filter column={header.column} table={table} />
                              </div>
                            ) : null}
                          </div>
                        )}
                        <div
                          {...{
                            onMouseDown: header.getResizeHandler(),
                            onTouchStart: header.getResizeHandler(),
                            className: `resizer ${
                              header.column.getIsResizing() ? "isResizing" : ""
                            }`,
                            style: {
                              transform:
                                columnResizeMode === "onEnd" &&
                                header.column.getIsResizing()
                                  ? `translateX(${
                                      table.getState().columnSizingInfo
                                        .deltaOffset
                                    }px)`
                                  : "",
                            },
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {!loading &&
                table.getRowModel().rows.map((row) => {
                  return (
                    <tr
                      key={row.id}
                      className={
                        selectedRow === row.original.TitleSlug
                          ? "row-selected"
                          : ""
                      }
                    >
                      {row.getVisibleCells().map((cell) => {
                        return (
                          <td
                            key={cell.id}
                            {...{
                              className: "tb-overflow",
                            }}
                          >
                            {
                              flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              ) as React.ReactNode
                            }
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </div>
        {loading && (
          <div className="w-100 p-3 border-0 text-center">
            <Spinner />
          </div>
        )}
        {renderPagination()}
      </div>
    </Container>
  );
}

function Filter({
  column,
  table,
}: {
  column: Column<Contest>;
  table: TTable<Contest>;
}) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();

  const sortedUniqueValues = React.useMemo(
    () =>
      typeof firstValue === "number"
        ? []
        : Array.from(column.getFacetedUniqueValues().keys()).sort(),
    [column.getFacetedUniqueValues()],
  );

  const [min, max] = column.getFacetedMinMaxValues() ?? [0, 0];

  return typeof firstValue === "number" ? (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <InputGroup>
        <DebouncedInput
          type="number"
          min={min}
          max={max}
          value={(columnFilterValue as [number, number])?.[0] ?? ""}
          onChange={(value) =>
            column.setFilterValue((old: [number, number]) => [value, old?.[1]])
          }
          placeholder={`Min (${min})`}
        />
        <DebouncedInput
          type="number"
          min={min}
          max={max}
          value={(columnFilterValue as [number, number])?.[1] ?? ""}
          onChange={(value) =>
            column.setFilterValue((old: [number, number]) => [old?.[0], value])
          }
          placeholder={`Max (${max})`}
        />
      </InputGroup>
    </div>
  ) : (
    <>
      <datalist id={column.id + "list"}>
        {sortedUniqueValues.slice(0, 5000).map((value) => (
          <option value={value} key={value} />
        ))}
      </datalist>
      <DebouncedInput
        type="text"
        value={(columnFilterValue ?? "") as string}
        onChange={(value) => column.setFilterValue(value)}
        placeholder={`Search... (${column.getFacetedUniqueValues().size})`}
        className="w-36 border shadow rounded"
        list={column.id + "list"}
      />
      <div className="h-1" />
    </>
  );
}

// A debounced input react component
function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value]);

  return (
    // @ts-ignore
    <Form.Control
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

export default ContestList;
