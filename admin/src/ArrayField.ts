// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment, useMemo, useState } from 'react'
import { callable, DialogOptions, Dict, Functionable, isOrderedEqual, setHidden, swap } from './misc'
import { Add, Edit, Delete, ArrowUpward, ArrowDownward, Undo, Check } from '@mui/icons-material'
import { FormDialog, formDialog } from './dialog'
import { GridActionsCellItem, GridAlignment, GridColDef } from '@mui/x-data-grid'
import { BoolField, FieldDescriptor, FieldProps, labelFromKey } from '@hfs/mui-grid-form'
import { Box, FormHelperText, FormLabel } from '@mui/material'
import { DateTimeField } from './DateTimeField'
import _ from 'lodash'
import { Center, Flex, IconBtn, useBreakpoint } from './mui'
import { DataTable, DataTableColumn } from './DataTable'

type ArrayFieldProps<T> = FieldProps<T[]> & {
    fields: Functionable<FieldDescriptor[] & {
        $width?: number,
        $column?: Partial<DataTableColumn>,
        $type?: string
        $hideUnder?: DataTableColumn['hideUnder'],
        showIf: (values: any) => unknown, // truthy
        $render?: GridColDef['renderCell'],
        $mergeRender: DataTableColumn['mergeRender'],
    }>,
    height?: number,
    reorder?: boolean,
    prepend?: boolean,
    autoRowHeight?: boolean,
    form?: Partial<FormDialog<any>>,
    dialog?: Partial<DialogOptions>,
    details?: boolean
}
export function ArrayField<T extends object>({ label, helperText, fields, value, onChange, onError, setApi, reorder, prepend, noRows, valuesForAdd, autoRowHeight, dialog, form, details, ...rest }: ArrayFieldProps<T>) {
    if (!Array.isArray(value)) // avoid crash if non-array values are passed, especially developing plugins
        value = []
    const rows = useMemo(() => value!.map((x,$idx) =>
            setHidden({ ...x } as any, x.hasOwnProperty('id') ? { $idx } : { id: $idx })),
        [JSON.stringify(value)]) //eslint-disable-line
    const formProp = (values: any) => ({
        fields: callable(fields, values).map(({ $width, $column, $type, $hideUnder, showIf, $render, $mergeRender, ...rest }) =>
            (!showIf || showIf(values)) && _.defaults(rest, byType[$type]?.field)),
        ...form,
    })
    setApi?.({ isEqual: isOrderedEqual }) // don't rely on stringify, as it wouldn't work with non-json values
    const [undo, setUndo] = useState<typeof value>()
    return h(Fragment, {},
        h(Flex, { rowGap: 0, flexWrap: 'wrap' },
            label && h(FormLabel, { sx: { ml: .5 } }, label),
            helperText && h(FormHelperText, {}, helperText),
        ),
        h(Box, { ...rest },
            h(DataTable, {
                rows,
                details,
                ...autoRowHeight && { getRowHeight: () => 'auto' as const },
                ...!useBreakpoint('sm') && { compact: true },
                sx: {
                    '.MuiDataGrid-virtualScroller': { minHeight: '3em' },
                    ...autoRowHeight && { '.MuiDataGrid-cell': { minHeight: '52px !important' } }
                },
                hideFooterSelectedRowCount: true,
                hideFooter: true,
                slots: {
                    noRowsOverlay: () => h(Center, {}, noRows || "No entries"),
                },
                slotProps: {
                    pagination: {
                        showFirstButton: true,
                        showLastButton: true,
                    }
                },
                columns: [
                    ...callable(fields, false).map(f => {
                        const def = byType[f.$type]?.column
                        return _.defaults({
                            field: f.k,
                            headerName: f.headerName ?? (typeof f.label === 'string' ? f.label : labelFromKey(f.k)),
                            disableColumnMenu: true,
                            valueGetter({ value }: any) {
                                return (f.toField || _.identity)(value)
                            },
                            ...f.$width ? { [f.$width >= 8 ? 'width' : 'flex']: f.$width } : (!def?.width && !def?.flex && { flex: 1 }),
                            renderCell: f.$render,
                            mergeRender: f.$mergeRender,
                            hideUnder: f.$hideUnder,
                            ...f.$column,
                        }, def)
                    }),
                    {
                        field: '',
                        type: 'actions',
                        width: 90,
                        headerAlign: 'center' as GridAlignment,
                        renderHeader(){
                            const title = "Add"
                            return h(Fragment, {},
                                h(IconBtn, {
                                    icon: Add,
                                    title,
                                    size: 'small',
                                    onClick: ev =>
                                        formDialog<T>({ form: formProp, title, values: valuesForAdd, dialogProps: dialog }).then(x => {
                                            if (!x) return
                                            const newValue = value?.slice() || []
                                            if (prepend) newValue.unshift(x)
                                            else newValue.push(x)
                                            set(newValue, ev)
                                        })
                                }),
                                undo !== undefined && h(IconBtn, {
                                    icon: Undo,
                                    title: "Undo",
                                    size: 'small',
                                    onClick: ev => set(undo!, ev)
                                }),
                            )
                        },
                        getActions({ row }) {
                            const { $idx=row.id } = row
                            const title = "Modify"
                            return [
                                h(GridActionsCellItem as any, {
                                    icon: h(Edit),
                                    label: title,
                                    title,
                                    async onClick(ev: MouseEvent) {
                                        ev.stopPropagation()
                                        const res = await formDialog<T>({
                                            values: row as any,
                                            form: formProp,
                                            title: h(Fragment, {}, title, label && ' - ', label),
                                            dialogProps: dialog
                                        })
                                        if (res)
                                            set(value!.map((oldRec, i) => i === $idx ? res : oldRec), ev)
                                    }
                                }),
                                h(GridActionsCellItem as any, {
                                    icon: h(Delete),
                                    label: "Delete",
                                    showInMenu: reorder,
                                    onClick: ev => {
                                        ev.stopPropagation()
                                        set(value!.filter((_rec, i) => i !== $idx), ev)
                                    },
                                }),
                                reorder && $idx && h(GridActionsCellItem as any, {
                                    icon: h(ArrowUpward),
                                    label: "Move up",
                                    showInMenu: true,
                                    onClick: ev => {
                                        ev.stopPropagation()
                                        set(swap(value!.slice(), $idx, $idx - 1), ev)
                                    },
                                }),
                                reorder && $idx < rows.length - 1 && h(GridActionsCellItem as any, {
                                    icon: h(ArrowDownward),
                                    label: "Move down",
                                    showInMenu: true,
                                    onClick: ev => {
                                        ev.stopPropagation()
                                        set(swap(value!.slice(), $idx, $idx + 1), ev)
                                    },
                                }),
                            ].filter(Boolean)
                        }
                    }
                ]
            })
        )
    )

    function set(newValue: NonNullable<typeof value>, event?: any) {
        onChange(newValue, { was: value, event })
        setUndo(value)
    }

}

const byType: Dict<{ field?: Partial<FieldDescriptor>, column?: Partial<GridColDef> }> = {
    boolean: {
        field: { comp: BoolField },
        column: { renderCell: ({ value }) => value && h(Check) },
    },
    dateTime: {
        field: { comp: DateTimeField },
        column: {
            minWidth: 96, flex: 0.5,
            renderCell: ({ value }) => value && new Date(value).toLocaleString(),
        }
    }
}