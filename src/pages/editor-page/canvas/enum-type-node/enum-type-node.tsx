import React, { useCallback, useMemo } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { EyeOff } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useChartDB } from '@/hooks/use-chartdb';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import { cn } from '@/lib/utils';

export const ENUM_TYPE_NODE_ID_PREFIX = 'enum-type:';

// eslint-disable-next-line react-refresh/only-export-components
export const customTypeIdToEnumTypeNodeId = (id: string) =>
    `${ENUM_TYPE_NODE_ID_PREFIX}${id}`;

// eslint-disable-next-line react-refresh/only-export-components
export const enumTypeNodeIdToCustomTypeId = (id: string) =>
    id.startsWith(ENUM_TYPE_NODE_ID_PREFIX)
        ? id.slice(ENUM_TYPE_NODE_ID_PREFIX.length)
        : id;

export type EnumTypeNodeType = Node<
    {
        customType: DBCustomType;
    },
    'enum-type'
>;

export const EnumTypeNode: React.FC<NodeProps<EnumTypeNodeType>> = React.memo(
    ({ data: { customType }, selected, dragging }) => {
        const { updateCustomType, readonly } = useChartDB();
        const focused = !!selected && !dragging;
        const values = useMemo(
            () => customType.values ?? [],
            [customType.values]
        );
        const accentColor = customType.color ?? '#64748b';

        const hideFromCanvas = useCallback(
            (event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                updateCustomType(customType.id, { showOnCanvas: false });
            },
            [customType.id, updateCustomType]
        );

        return (
            <div
                className={cn(
                    'flex w-full flex-col overflow-hidden rounded-md border-2 bg-slate-50 shadow-sm dark:bg-slate-950',
                    selected
                        ? 'border-pink-600'
                        : 'border-slate-500 dark:border-slate-700'
                )}
            >
                {!readonly ? (
                    <NodeResizer
                        isVisible={focused}
                        minWidth={180}
                        shouldResize={(event) => event.dy === 0}
                        lineClassName="!border-pink-500"
                        handleClassName="!h-3 !w-3 !rounded-full !bg-pink-500"
                    />
                ) : null}

                <div
                    className="h-2 shrink-0 rounded-t-[4px]"
                    style={{ backgroundColor: accentColor }}
                />

                <div className="group flex h-9 items-center justify-between gap-2 bg-slate-200 px-2 dark:bg-slate-900">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-sm border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            enum
                        </span>
                        <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                            {customType.name}
                        </div>
                    </div>

                    {!readonly ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    aria-label="Hide enum from canvas"
                                    variant="ghost"
                                    className="nodrag size-6 shrink-0 p-0 text-slate-500 opacity-0 hover:bg-primary-foreground hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    onClick={hideFromCanvas}
                                >
                                    <EyeOff className="size-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Hide from canvas</TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>

                <div className="max-h-64 overflow-auto py-1">
                    {values.length > 0 ? (
                        values.map((value, index) => (
                            <div
                                key={`${value}-${index}`}
                                className="border-t border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-700 first:border-t-0 dark:border-slate-800 dark:text-slate-300"
                                title={value}
                            >
                                <div className="truncate">{value}</div>
                            </div>
                        ))
                    ) : (
                        <div className="p-3 text-xs italic text-muted-foreground">
                            No enum values
                        </div>
                    )}
                </div>
            </div>
        );
    }
);

EnumTypeNode.displayName = 'EnumTypeNode';
