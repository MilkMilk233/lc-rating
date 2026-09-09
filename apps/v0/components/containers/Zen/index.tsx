"use client";

// Custom components
import { FilterIcon, ShareIcon } from "@components/icons";
import Loading from "@components/Loading";
import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";

// hooks
import { useProgressStore } from "@hooks/useProgressStore";
import { EFFORT_BANDS, attemptLabel } from "@hooks/useProgressStore/bands";
import { isDue } from "@hooks/useProgressStore/srs";
import type { ScheduleState } from "@hooks/useProgressStore/srs";
import type {
  AttemptEvent,
  EffortBand,
} from "@hooks/useProgressStore/types";
import { QTag, useQuestionTags } from "@hooks/useQuestionTags";
import {
  LeetCodeLanguage,
  useLeetCodeLanguage,
} from "@hooks/useLeetCodeLanguage";
import useStorage from "@hooks/useStorage";
import { Tags, useTags } from "@hooks/useTags";
import { useZen } from "@hooks/useZen";
import {
  leetCodeContestUrl,
  leetCodeProblemUrl,
} from "@utils/leetcodeLinks";

import {
  Column,
  ColumnDef,
  ColumnResizeDirection,
  ColumnResizeMode,
  PaginationState,
  Table as TTable,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import React, { useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Container,
  Dropdown,
  Form,
  Modal,
  Pagination,
  Table,
} from "react-bootstrap";

// Constants and Enums
const LC_RATING_ZEN_LAST_USED_FILTER_KEY = `lc-rating-zen-last-used-filter`;
const LC_RATING_ZEN_SETTINGS_KEY = `lc-rating-zen-settings-v2`;

// Question Data Type
interface ConstQuestion {
  cont_title: string;
  cont_title_slug: string;
  title: string;
  title_slug: string;
  question_id: string;
  paid_only: boolean;
  rating: number;
  _hash: number;
}

// Filter Related
interface Filter {
  label: string;
  fn: (r: ConstQuestion) => boolean;
}
const createRatingFilter = (min: number, max?: number) => {
  return (r: ConstQuestion) => {
    return max === undefined
      ? r.rating >= min
      : r.rating >= min && r.rating < max;
  };
};

const ALL_FILTER_LABEL = "< ALL >";

const ratingFilters: Filter[] = [
  { label: "(<=1200)", fn: createRatingFilter(1, 1200) }, // starting from 1 to exclude unrated questions
  { label: "(1200 - 1400)", fn: createRatingFilter(1200, 1400) },
  { label: "(1400 - 1600)", fn: createRatingFilter(1400, 1600) },
  { label: "(1600 - 1900)", fn: createRatingFilter(1600, 1900) },
  { label: "(1900 - 2100)", fn: createRatingFilter(1900, 2100) },
  { label: "(2100 - 2400)", fn: createRatingFilter(2100, 2400) },
  { label: "(>=2400)", fn: createRatingFilter(2400) },
  { label: ALL_FILTER_LABEL, fn: createRatingFilter(1) },
];

// Filter Button Component
interface FilterButtonProps {
  label: string;
  variant: string;
  onFilterChange: (filterKey: string) => void;
}

const FilterButton = React.memo(
  ({ label, variant, onFilterChange }: FilterButtonProps) => (
    <Button onClick={() => onFilterChange(label)} variant={variant}>
      {label}
    </Button>
  ),
);

function buildTagFilterFn(
  selectedTags: Record<string, boolean>,
  q: (id: string) => QTag,
) {
  return Object.keys(selectedTags).length == 0
    ? () => true
    : (v: ConstQuestion) => {
        const tags = q(v._hash.toString());
        if (!tags || !tags[0] || tags[0].length == 0) {
          return false;
        }
        for (let i = 0; i < tags[0].length; i++) {
          if (selectedTags[tags[0][i]]) {
            return true;
          }
        }
        return false;
      };
}

const allBandsSelected = (): Record<EffortBand, boolean> =>
  EFFORT_BANDS.reduce((acc, band) => {
    acc[band.key] = true;
    return acc;
  }, {} as Record<EffortBand, boolean>);

interface ZenFilters {
  outcome: "" | "solved" | "gaveup";
  bands: Record<EffortBand, boolean>;
  dueOnly: boolean;
  selectedTags: Record<string, boolean>;
}

interface SettingsType {
  columnVisibility: VisibilityState;
  filters: ZenFilters;
}

const defaultSettings: SettingsType = {
  columnVisibility: { tags: true, ratings: true, en: true },
  filters: {
    outcome: "",
    bands: allBandsSelected(),
    dueOnly: false,
    selectedTags: {},
  },
};

interface FilterSettingsProps {
  handleClose: () => void;
  onSettingsSaved: React.Dispatch<React.SetStateAction<SettingsType | undefined>>;
  tags: Tags;
  lang: "zh" | "en";
  settings: SettingsType;
}

const FilterSettings: React.FunctionComponent<FilterSettingsProps> = ({
  tags,
  handleClose,
  onSettingsSaved,
  settings,
  lang,
}: FilterSettingsProps) => {
  const [curSetting, setCurSetting] = useState<SettingsType>(settings);

  const onTagsChange = (key: string) => {
    const selectedTags = { ...curSetting.filters.selectedTags };
    if (selectedTags[key]) {
      delete selectedTags[key];
    } else {
      selectedTags[key] = true;
    }
    setCurSetting({
      ...curSetting,
      filters: { ...curSetting.filters, selectedTags },
    });
  };

  const onTagsReset = () => {
    setCurSetting({
      ...curSetting,
      filters: { ...curSetting.filters, selectedTags: {} },
    });
  };

  const onVisibilityChange = (name: string) => {
    setCurSetting({
      ...curSetting,
      columnVisibility: {
        ...curSetting.columnVisibility,
        [name]: !curSetting.columnVisibility[name],
      },
    });
  };

  const onOutcomeChange = (outcome: ZenFilters["outcome"]) => {
    setCurSetting({
      ...curSetting,
      filters: { ...curSetting.filters, outcome },
    });
  };

  const onBandToggle = (band: EffortBand) => {
    setCurSetting({
      ...curSetting,
      filters: {
        ...curSetting.filters,
        bands: {
          ...curSetting.filters.bands,
          [band]: !curSetting.filters.bands[band],
        },
      },
    });
  };

  const onDueOnlyChange = () => {
    setCurSetting({
      ...curSetting,
      filters: { ...curSetting.filters, dueOnly: !curSetting.filters.dueOnly },
    });
  };

  const onCancel = () => {
    handleClose();
  };

  const onConfirm = () => {
    onSettingsSaved(curSetting);
    handleClose();
  };

  const RenderTags = (tags: Tags) => {
    if (!tags) return;
    return (
      <div
        className="d-flex flex-wrap zen-filter-tag"
        style={{ columnGap: "1rem" }}
      >
        {tags.map((tag) => {
          return (
            <span
              onClick={() => onTagsChange(tag[1])}
              className="p-1"
              key={tag[1]}
            >
              <Button
                size="sm"
                variant={
                  curSetting.filters.selectedTags[tag[1]]
                    ? "primary"
                    : "secondary"
                }
              >
                {lang === "en" ? tag[1] : tag[2]}
              </Button>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Modal
        show={true}
        dialogClassName="zen-filter-dialog"
        onHide={handleClose}
        size="xl"
      >
        <Modal.Header closeButton>
          <Modal.Title>设置</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h5 className="pt-1 pb-1">
            列显示
            <Form className="d-flex mt-2 gap-3">
              <Form.Check
                checked={Boolean(curSetting.columnVisibility.tags)}
                onChange={() => onVisibilityChange("tags")}
                type="switch"
                label="算法标签"
                id="toggle-tags"
              />
              <Form.Check
                checked={Boolean(curSetting.columnVisibility.en)}
                onChange={() => onVisibilityChange("en")}
                type="switch"
                label="英文链接"
                id="toggle-en"
              />
              <Form.Check
                checked={Boolean(curSetting.columnVisibility.ratings)}
                onChange={() => onVisibilityChange("ratings")}
                type="switch"
                label="难度分"
                id="toggle-ratings"
              />
            </Form>
          </h5>
          <hr />
          <h5>
            标签 <Button onClick={onTagsReset}>重置</Button>
          </h5>
          {RenderTags(tags)}
          <hr />
          <h5 className="pt-1 pb-1">练习记录</h5>
          <div className="d-flex flex-wrap align-items-center gap-3">
            <div className="w-25" style={{ minWidth: "12rem" }}>
              <Form.Select
                value={curSetting.filters.outcome}
                onChange={(e) =>
                  onOutcomeChange(e.target.value as ZenFilters["outcome"])
                }
              >
                <option value="">[全部]</option>
                <option value="solved">做出来了</option>
                <option value="gaveup">没做出来</option>
              </Form.Select>
            </div>
            <Form.Check
              checked={curSetting.filters.dueOnly}
              onChange={onDueOnlyChange}
              type="switch"
              label="只看已到期"
              id="toggle-due"
            />
          </div>
          <div className="mt-3">
            <div className="text-muted mb-2" style={{ fontSize: ".85rem" }}>
              体感档位（仅在「做出来了」时生效）
            </div>
            <ButtonGroup size="sm" className="flex-wrap">
              {EFFORT_BANDS.map((band) => (
                <Button
                  key={band.key}
                  variant={
                    curSetting.filters.bands[band.key]
                      ? "primary"
                      : "outline-secondary"
                  }
                  onClick={() => onBandToggle(band.key)}
                >
                  {band.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel}>
            关闭
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            应用设置
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default function Zenk() {
  // State and hooks
  const { zen: data, isPending: progressLoading } = useZen();
  const { language, isCn } = useLeetCodeLanguage();
  const { derived } = useProgressStore();

  const { tags, isPending: tagsLoading } = useQuestionTags(null);
  const { tags: qtags } = useTags();

  const [showFilter, setShowFilter] = useState(false);
  const [recordTarget, setRecordTarget] = useState<{
    qid: string;
    title: string;
  } | null>(null);

  const [settings = defaultSettings, setSettings] = useStorage<SettingsType>(
    LC_RATING_ZEN_SETTINGS_KEY,
    {
      defaultValue: defaultSettings,
    },
  );

  const [currentFilterKey, setCurrentFilterKey] = useStorage(
    LC_RATING_ZEN_LAST_USED_FILTER_KEY,
    {
      defaultValue: ALL_FILTER_LABEL,
    },
  );

  const queryTags = (id: string): QTag => {
    return tags ? tags[id] : [[], []];
  };

  const curRatingFilter = useMemo(() => {
    return (
      ratingFilters.find((filter) => filter.label === currentFilterKey)?.fn ||
      (() => true)
    );
  }, [currentFilterKey]);

  const now = Date.now();

  const filteredData = useMemo(() => {
    const { filters } = settings;
    const tagsFilter = buildTagFilterFn(filters.selectedTags, queryTags);
    const selectedBands = EFFORT_BANDS.filter(
      (band) => filters.bands[band.key],
    ).map((band) => band.key);
    const bandFilterActive =
      filters.outcome === "solved" &&
      selectedBands.length < EFFORT_BANDS.length;

    return data.filter(curRatingFilter).filter(tagsFilter).filter((item) => {
      const current = derived.currentByQid.get(item.question_id);

      if (filters.dueOnly) {
        const schedule = derived.scheduleByQid.get(item.question_id);
        if (!isDue(schedule, now)) return false;
      }

      if (filters.outcome === "solved") {
        if (!current || current.outcome !== "solved") return false;
        if (bandFilterActive && !selectedBands.includes(current.band)) {
          return false;
        }
      } else if (filters.outcome === "gaveup") {
        if (!current || current.outcome !== "gaveup") return false;
      }

      return true;
    });
  }, [data, curRatingFilter, settings, derived, now, queryTags]);

  if (progressLoading) {
    return <Loading />;
  }

  return (
    <Container fluid className="zen-container page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Difficulty practice</p>
          <h1 className="page-title">难度练习</h1>
          <p className="page-description">
            按评级区间、标签和练习记录筛选题目，记录只保存在当前浏览器。
          </p>
        </div>
        <div className="metric-strip">
          <span className="metric-pill">
            Showing <strong>{filteredData.length}</strong>
          </span>
          <span className="metric-pill">
            Filter <strong>{currentFilterKey}</strong>
          </span>
        </div>
      </header>
      <nav className="toolbar-panel zen-nav">
        <ButtonGroup>
          {ratingFilters.map((filter: Filter) => (
            <FilterButton
              key={filter.label}
              label={filter.label}
              variant={
                filter.label === currentFilterKey ? "primary" : "secondary"
              }
              onFilterChange={(filterKey) => {
                setCurrentFilterKey(filterKey);
              }}
            />
          ))}
        </ButtonGroup>
        <Button variant="outline-secondary" onClick={() => setShowFilter(true)}>
          <FilterIcon width={24} height={24} />
          <span className="ms-1">筛选</span>
        </Button>
      </nav>

      {showFilter && (
        <FilterSettings
          lang={isCn ? "zh" : "en"}
          tags={qtags}
          handleClose={() => setShowFilter(false)}
          onSettingsSaved={setSettings}
          settings={settings}
        />
      )}
      <div className="data-panel zen-data-panel">
        <ZenTableComp
          language={language}
          tagLanguage={isCn ? "zh" : "en"}
          columnVisibility={settings.columnVisibility}
          queryTags={queryTags}
          data={filteredData}
          currentByQid={derived.currentByQid}
          scheduleByQid={derived.scheduleByQid}
          onRecord={(qid, title) => setRecordTarget({ qid, title })}
        />
      </div>

      <Modal
        show={!!recordTarget}
        onHide={() => setRecordTarget(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>记录这次练习</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {recordTarget && (
            <ProgressRecordPanel
              qid={recordTarget.qid}
              questionTitle={recordTarget.title}
              source="zen"
              onRecorded={() => setRecordTarget(null)}
              onCancel={() => setRecordTarget(null)}
            />
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
}

interface ZenTableCompProps {
  columnVisibility: VisibilityState;
  queryTags: (id: string) => QTag;
  data: ConstQuestion[];
  language: LeetCodeLanguage;
  tagLanguage: "zh" | "en";
  currentByQid: Map<string, AttemptEvent>;
  scheduleByQid: Map<string, ScheduleState>;
  onRecord: (qid: string, title: string) => void;
}

const ZenTableComp = React.memo(
  ({
    queryTags,
    data,
    language,
    tagLanguage,
    columnVisibility,
    currentByQid,
    scheduleByQid,
    onRecord,
  }: ZenTableCompProps) => {
    const columns = React.useMemo<ColumnDef<ConstQuestion>[]>(
      () => [
        {
          accessorFn: (row) => row.cont_title_slug,
          id: "场次",
          enableColumnFilter: false,
          cell: (info) => {
            const item = info.row.original;
            return (
              <div className="d-flex justify-content-between align-items-center p-1">
                <a
                  href={leetCodeContestUrl(item.cont_title_slug, language)}
                  target="_blank"
                >
                  {item.cont_title}
                </a>
              </div>
            );
          },
        },
        {
          accessorFn: (row) => row.title,
          id: "qustion",
          enableResizing: true,
          size: 300,
          sortingFn: (a, b) => {
            return Number(`${a.original.question_id}`) <
              Number(`${b.original.question_id}`)
              ? -1
              : 1;
          },
          cell: (info) => {
            const item = info.row.original;
            return (
              <div className="d-flex justify-content-between align-items-center">
                {!!item.paid_only && <span>👑</span>}
                <div>
                  <a
                    href={leetCodeProblemUrl(item.title_slug, language)}
                    target="_blank"
                  >
                    {item.question_id}. {item.title}
                  </a>
                  {columnVisibility["en"] && (
                    <a
                      href={leetCodeProblemUrl(
                        item.title_slug,
                        language === "cn" ? "en" : "cn",
                      )}
                      target="_blank"
                      className="ms-2"
                    >
                      <ShareIcon height={16} width={16} />
                    </a>
                  )}
                </div>
              </div>
            );
          },
          enableColumnFilter: false,
          header: () => <span>题号</span>,
          // footer: (props) => props.column.id,
        },
        {
          accessorKey: "rating",
          id: "ratings",
          header: () => "难度分",
          size: 80,
          enableColumnFilter: false,
          cell: (info) => (
            <>
              <RatingCircle rating={Number(info.getValue())} />
              <ColorRating rating={Number(info.getValue())}>
                {Number(info.getValue()).toFixed(0)}
              </ColorRating>
            </>
          ),
        },
        {
          accessorFn: (row) => {
            let tags = queryTags(row._hash.toString());
            return tags ? tags[tagLanguage === "en" ? 0 : 1] : "-";
          },
          header: "算法标签",
          id: "tags",
          footer: (props) => props.column.id,
          enableColumnFilter: false,
          enableSorting: false,
        },
        {
          accessorFn: (row) => row.question_id,
          id: "progress",
          header: "进度",
          enableColumnFilter: false,
          enableSorting: false,
          cell: (info) => {
            const item = info.row.original;
            const current = currentByQid.get(item.question_id);
            const schedule = scheduleByQid.get(item.question_id);
            const due = isDue(schedule, Date.now());

            return (
              <div className="zen-progress-cell">
                <button
                  type="button"
                  className={`pc-state${current ? " recorded" : ""}`}
                  onClick={() => onRecord(item.question_id, item.title)}
                  title={current ? "重新记录" : "记录这次练习"}
                >
                  {attemptLabel(current)}
                </button>
                {due && <span className="zen-due">到期</span>}
              </div>
            );
          },
          footer: (props) => props.column.id,
        },
      ],
      [
        queryTags,
        language,
        tagLanguage,
        columnVisibility,
        currentByQid,
        scheduleByQid,
        onRecord,
      ],
    );

    // const { zen: data, isPending: loading } = useZen(null);
    return (
      <ZenTable
        {...{
          columnVisibility: columnVisibility,
          data: data,
          columns: columns,
          queryTags: queryTags,
        }}
      />
    );
  },
);

const ZenTable = React.memo(
  ({
    data,
    columns,
    columnVisibility = {
      tags: true,
    },
  }: {
    data: ConstQuestion[];
    columns: ColumnDef<ConstQuestion>[];
    columnVisibility?: VisibilityState;
  }) => {
    const [pagination, setPagination] = React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 50,
    });

    const [columnResizeMode, setColumnResizeMode] =
      React.useState<ColumnResizeMode>("onChange");

    const [columnResizeDirection, setColumnResizeDirection] =
      React.useState<ColumnResizeDirection>("ltr");

    const table = useReactTable({
      columns,
      data,
      debugTable: false,
      columnResizeDirection,
      columnResizeMode,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      onPaginationChange: setPagination,
      //no need to pass pageCount or rowCount with client-side pagination as it is calculated automatically
      state: {
        pagination,
        columnVisibility,
      },
      autoResetPageIndex: true, // turn off page index reset when sorting or filtering
    });

    const renderPagination = (align: "start" | "end") => (
      <div className={`pagination-bar justify-content-${align}`}>
        <div className="toolbar-group">
          <Pagination>
            <Pagination.First
              onClick={() => table.firstPage()}
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
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
            />
          </Pagination>
          <span className="metric-pill">
            Page{" "}
            <strong>
              {table.getState().pagination.pageIndex + 1} /{" "}
              {table.getPageCount().toLocaleString()}
            </strong>
          </span>
          <Form.Control
            type="number"
            defaultValue={table.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              const page = e.target.value ? Number(e.target.value) - 1 : 0;
              table.setPageIndex(page);
            }}
            className="compact-input"
            aria-label="跳转页码"
          />
          <Dropdown
            onSelect={(e) => {
              //@ts-ignore
              table.setPageSize(Number(e));
            }}
          >
            <Dropdown.Toggle variant="outline-secondary">
              {table.getState().pagination.pageSize} / page
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {[10, 20, 30, 50, 100].map((pageSize, idx) => (
                <Dropdown.Item key={`opt-${idx}`} eventKey={pageSize}>
                  {pageSize}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <span className="metric-pill">
            Total <strong>{table.getRowCount().toLocaleString()}</strong>
          </span>
        </div>
      </div>
    );

    return (
      <div>
        {renderPagination("start")}
        <div className="table-scroll">
          <Table
            hover
            className="app-table zen-table"
            {...{
              style: {
                width: "100%",
              },
            }}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup, idx) => (
                <tr key={headerGroup.id + idx}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        style={{
                          width: `${header.getSize()}px`,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          {...{
                            className: header.column.getCanSort()
                              ? "cursor-pointer select-none"
                              : "select-none",
                            onClick: header.column.getToggleSortingHandler(),
                          }}
                        >
                          {
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            ) as React.ReactNode
                          }
                          {{
                            asc: " 🔼",
                            desc: " 🔽",
                          }[header.column.getIsSorted() as string] ??
                            (header.column.getCanSort() ? "↕️" : null)}
                          {header.column.getCanFilter() ? (
                            <div>
                              <Filter column={header.column} table={table} />
                            </div>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                return (
                  <tr key={row.id} className="zen-table-row">
                    {row.getVisibleCells().map((cell) => {
                      return (
                        <td key={cell.id}>
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
        {renderPagination("end")}
      </div>
    );
  },
);

function Filter({
  column,
  table,
}: {
  column: Column<ConstQuestion, unknown>;
  table: TTable<ConstQuestion>;
}) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();

  return typeof firstValue === "number" ? (
    <div className="d-flex space-x-2">
      <input
        type="number"
        value={(columnFilterValue as [number, number])?.[0] ?? ""}
        onChange={(e) =>
          column.setFilterValue((old: [number, number]) => [
            e.target.value,
            old?.[1],
          ])
        }
        placeholder={`Min`}
        className="w-24 border shadow rounded"
      />
      <input
        type="number"
        value={(columnFilterValue as [number, number])?.[1] ?? ""}
        onChange={(e) =>
          column.setFilterValue((old: [number, number]) => [
            old?.[0],
            e.target.value,
          ])
        }
        placeholder={`Max`}
        className="w-24 border shadow rounded"
      />
    </div>
  ) : (
    <input
      type="text"
      value={(columnFilterValue ?? "") as string}
      onChange={(e) => column.setFilterValue(e.target.value)}
      placeholder={`Search...`}
      className="w-36 border shadow rounded"
    />
  );
}
