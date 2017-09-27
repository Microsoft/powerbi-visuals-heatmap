/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    import ValueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import IVisual = powerbi.extensibility.visual.IVisual;
    import IColorPalette = powerbi.extensibility.IColorPalette;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import LabelLayoutStrategy = powerbi.extensibility.utils.chart.axis.LabelLayoutStrategy;
    import TextMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import translate = powerbi.extensibility.utils.svg.translate;
    import createLinearColorScale = powerbi.extensibility.utils.color.createLinearColorScale;
    import LinearColorScale = powerbi.extensibility.utils.color.LinearColorScale;
    import Quantile = d3.scale.Quantile;
    import Update = d3.selection.Update;
    import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;

    // powerbi.extensibility.utils.tooltip
    import TooltipEventArgs = powerbi.extensibility.utils.tooltip.TooltipEventArgs;
    import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;
    import TooltipEnabledDataPoint = powerbi.extensibility.utils.tooltip.TooltipEnabledDataPoint;
    import createTooltipServiceWrapper = powerbi.extensibility.utils.tooltip.createTooltipServiceWrapper;

    type D3Element =
        d3.selection.Update<any> |
            d3.Selection<any> |
            d3.Transition<any>;


    export class TableHeatMap implements IVisual {
        private static Properties: any = {
            dataPoint: {
                fill: <DataViewObjectPropertyIdentifier> {
                    objectName: "dataPoint",
                    propertyName: "fill"
                }
            },
            labels: {
                labelPrecision: <DataViewObjectPropertyIdentifier>{
                    objectName: "labels",
                    propertyName: "labelPrecision"
                }
            }
        };

        private host: IVisualHost;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private svg: d3.Selection<any>;
        private div: d3.Selection<any>;
        private mainGraphics: d3.Selection<any>;
        private colors: IColorPalette;
        private dataView: DataView;
        private viewport: IViewport;
        private margin: IMargin = {left: 5, right: 10, bottom: 15, top: 10};
        private animationDuration: number = 1000;

        private static ClsAll: string = "*";
        private static ClsCategoryX: string = "categoryX";
        private static ClsMono: string = "mono";
        public static CLsHeatMapDataLabels = "heatMapDataLabels";
        private static ClsCategoryYLabel: string = "categoryYLabel";
        private static ClsCategoryXLabel: string = "categoryXLabel";
        private static ClsAxis: string = "axis";
        private static ClsLegend: string = "legend";
        private static ClsBordered: string = "bordered";
        private static ClsNameSvgTableHeatMap: string = "svgTableHeatMap";
        private static ClsNameDivTableHeatMap: string = "divTableHeatMap";

        private static AttrTransform: string = "transform";
        private static AttrX: string = "x";
        private static AttrY: string = "y";
        private static AttrDX: string = "dx";
        private static AttrDY: string = "dy";
        private static AttrHeight: string = "height";
        private static AttrWidth: string = "width";

        private static HtmlObjTitle: string = "title";
        private static HtmlObjSvg: string = "svg";
        private static HtmlObjDiv: string = "div";
        private static HtmlObjG: string = "g";
        private static HtmlObjText: string = "text";
        private static HtmlObjRect: string = "rect";
        private static HtmlObjTspan: string = "tspan";

        private static StFill: string = "fill";
        private static StTextAnchor: string = "text-anchor";

        private static ConstEnd: string = "end";
        private static ConstBegin: string = "begin";
        private static ConstMiddle: string = "middle";
        private static Const0em: string = "0em";
        private static Const071em: string = ".71em";

        private static ConstGridSizeWidthLimit: number = 80;
        private static ConstShiftLabelFromGrid: number = -6;
        private static ConstGridHeightWidthRaito: number = 0.5;
        private static ConstGridLegendWidthRaito: number = 0.666;
        private static ConstLegendOffsetFromChartByY: number = 0.5;

        private static BucketCountMaxLimit: number = 18;
        private static BucketCountMinLimit: number = 1;
        private static ColorbrewerMaxBucketCount: number = 14;

        private static DefaultColorbrewer: string = "Reds";

        private settings: TableHeatmapSettings;

        private element: HTMLElement;

        public converter(dataView: DataView, colors: IColorPalette): TableHeatMapChartData {
            // no category - nothing to display
            if (!dataView || !dataView.categorical || !dataView.categorical.categories || !dataView.categorical.categories[0] || !dataView.categorical.categories[0].values || !dataView.categorical.categories[0].values.length) {
                return <TableHeatMapChartData>{
                    dataPoints: null
                };
            }
            // no values - nothing to display
            if (!dataView.categorical.values || !dataView.categorical.values[0] || !dataView.categorical.values[0].values || !dataView.categorical.values[0].values.length) {
                return <TableHeatMapChartData>{
                    dataPoints: null
                };
            }

            let categoryValueFormatter: IValueFormatter;
            let valueFormatter: IValueFormatter;
            let dataPoints: TableHeatMapDataPoint[] = [];
            let catMetaData: DataViewMetadata = dataView.metadata;
            let catTable: DataViewTable = dataView.table;
            let catX: string[] = [];
            let catY: string[] = [];

            let categoryX: string, categoryY: string;

            categoryValueFormatter = ValueFormatter.create({
                format: ValueFormatter.getFormatStringByColumn(dataView.categorical.categories[0].source),
                value: dataView.categorical.categories[0].values[0]
            });

            valueFormatter = ValueFormatter.create({
                format: ValueFormatter.getFormatStringByColumn(dataView.categorical.values[0].source),
                value: dataView.categorical.values[0].values[0]
            });

            for (let i in dataView.table.rows) {
                let values: TableHeatMapDataPoint[] = [];
                let k: number = 0;

                for (let j in dataView.table.columns) {
                    let columnValFormatter: IValueFormatter;
                    if (catMetaData.columns[j].format) {
                        columnValFormatter = ValueFormatter.create({
                            format: catMetaData.columns[j].format
                        });
                    }

                    if (!catMetaData.columns[j].isMeasure) {
                        categoryX = catX[i] = <string>catTable.rows[i][j];
                    }
                    if (catMetaData.columns[j].isMeasure) {
                        let value: any = catTable.rows[i][j];
                        let valueStr: string;
                        categoryY = catY[j] = catMetaData.columns[j].displayName;
                        if (value) {
                            if (catMetaData.columns[j].groupName) {
                                categoryY += ": " + catMetaData.columns[j].groupName;
                                catY[j] += ": " + catMetaData.columns[j].groupName;
                            }

                            if (value !== parseInt(<string>value, 10))
                                value = (<number>value).toFixed(2);
                            if (catMetaData.columns[j].format) {
                                valueStr = columnValFormatter.format(value);
                            }
                        }
                        values[k] = <TableHeatMapDataPoint>{
                            value: value,
                            valueStr: valueStr,
                            categoryY: categoryY
                        };
                        k++;
                    }
                }

                values.forEach((element) => {
                    dataPoints.push({
                        categoryX: categoryX,
                        categoryY: element.categoryY,
                        value: element.value,
                        valueStr: element.valueStr,
                        tooltipInfo: [{
                            displayName: `Category`,
                            value: (categoryX || "").toString()
                        },
                        {
                            displayName: `Y`,
                            value: (element.categoryY || "").toString()
                        },
                        {
                            displayName: `Value`,
                            value: (element.value || "").toString()
                        }]
                    });
                });
            }
            return <TableHeatMapChartData>{
                dataPoints: dataPoints,
                categoryX: catX.filter((n) => {
                    return n !== undefined;
                }),
                categoryY: catY.filter((n) => {
                    return n !== undefined;
                }),
                categoryValueFormatter: categoryValueFormatter,
                valueFormatter: valueFormatter
            };
        }

        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.element = options.element;

            this.div = d3.select(options.element)
                .append(TableHeatMap.HtmlObjDiv)
                .classed(TableHeatMap.ClsNameDivTableHeatMap, true);
            this.svg = this.div
                .append(TableHeatMap.HtmlObjSvg)
                .classed(TableHeatMap.ClsNameSvgTableHeatMap, true);

            this.tooltipServiceWrapper = createTooltipServiceWrapper(
                this.host.tooltipService,
                options.element);
        }

        public update(options: VisualUpdateOptions): void {
            if (!options.dataViews || !options.dataViews[0]) {
                return;
            }

            this.settings = TableHeatMap.parseSettings(options.dataViews[0]);

            this.svg.selectAll(TableHeatMap.ClsAll).remove();
            this.div.attr({
                widtht: PixelConverter.toString(options.viewport.width + this.margin.left),
                height: PixelConverter.toString(options.viewport.height + this.margin.left)
            });
            this.div.style({
                widtht: PixelConverter.toString(options.viewport.width + this.margin.left),
                height: PixelConverter.toString(options.viewport.height + this.margin.left)
            });

            this.svg.attr({
                width: options.viewport.width,
                height: options.viewport.height
            });

            this.mainGraphics = this.svg.append(TableHeatMap.HtmlObjG);

            this.setSize(options.viewport);

            this.updateInternal(options);
        }

        private getYAxisWidth(chartData: TableHeatMapChartData): number {
            let maxLengthText: string = _.maxBy(chartData.categoryY, "length") || "";
            maxLengthText = TableHeatMap.textLimit(maxLengthText, this.settings.yAxisLabels.maxTextSymbol);
            return TextMeasurementService.measureSvgTextWidth({
                fontSize: PixelConverter.toString(this.settings.yAxisLabels.fontSize),
                text: maxLengthText.trim(),
                fontFamily: this.settings.yAxisLabels.fontFamily
            });
        }

        private getXAxisHeight(chartData: TableHeatMapChartData): number {
            let maxLengthText: string = _.maxBy(chartData.categoryY, "length") || "";
            return TextMeasurementService.measureSvgTextHeight({
                fontSize: PixelConverter.toString(this.settings.xAxisLabels.fontSize),
                text: maxLengthText.trim(),
                fontFamily: this.settings.xAxisLabels.fontFamily
            });
        }

        private getYAxisHeight(chartData: TableHeatMapChartData): number {
            let maxLengthText: string = _.maxBy(chartData.categoryY, "length") || "";
            return TextMeasurementService.measureSvgTextHeight({
                fontSize: PixelConverter.toString(this.settings.yAxisLabels.fontSize),
                text: maxLengthText.trim(),
                fontFamily: this.settings.yAxisLabels.fontFamily
            });
        }

        private static parseSettings(dataView: DataView): TableHeatmapSettings {
            let settings: TableHeatmapSettings = TableHeatmapSettings.parse<TableHeatmapSettings>(dataView);
            if (!settings.general.enableColorbrewer) {
                if (settings.general.buckets > TableHeatMap.BucketCountMaxLimit) {
                    settings.general.buckets = TableHeatMap.BucketCountMaxLimit;
                }
                if (settings.general.buckets < TableHeatMap.BucketCountMinLimit) {
                    settings.general.buckets = TableHeatMap.BucketCountMinLimit;
                }
            } else {
                if (settings.general.colorbrewer === "") {
                    settings.general.colorbrewer = TableHeatMap.DefaultColorbrewer;
                }
                let colorbrewerArray: IColorArray = colorbrewer[settings.general.colorbrewer];
                let minBucketNum: number = 0;
                let maxBucketNum: number = 0;
                for (let bucketIndex: number = TableHeatMap.BucketCountMinLimit; bucketIndex < TableHeatMap.ColorbrewerMaxBucketCount; bucketIndex++) {
                    if (minBucketNum === 0 && (colorbrewerArray as Object).hasOwnProperty(bucketIndex.toString()) ) {
                        minBucketNum = bucketIndex;
                    }
                    if ((colorbrewerArray as Object).hasOwnProperty(bucketIndex.toString()) ) {
                        maxBucketNum = bucketIndex;
                    }
                }

                if (settings.general.buckets > maxBucketNum) {
                    settings.general.buckets = maxBucketNum;
                }
                if (settings.general.buckets < minBucketNum) {
                    settings.general.buckets = minBucketNum;
                }
            }
            return settings;
        }

        private updateInternal(options: VisualUpdateOptions): void {
            let dataView: DataView = this.dataView = options.dataViews[0];
            let chartData: TableHeatMapChartData = this.converter(dataView, this.colors);
            let suppressAnimations: boolean = false;
            if (chartData.dataPoints) {
                let minDataValue: number = d3.min(chartData.dataPoints, function (d: TableHeatMapDataPoint) {
                    return d.value;
                });
                let maxDataValue: number = d3.max(chartData.dataPoints, function (d: TableHeatMapDataPoint) {
                    return d.value;
                });

                let numBuckets: number = this.settings.general.buckets;
                let colorbrewerScale: string = this.settings.general.colorbrewer;
                let colorbrewerEnable: boolean = this.settings.general.enableColorbrewer;
                let colors: Array<string>;
                if (colorbrewerEnable) {
                    if (colorbrewerScale) {
                        let currentColorbrewer: IColorArray = colorbrewer[colorbrewerScale];
                        colors = (currentColorbrewer ? currentColorbrewer[numBuckets] : colorbrewer.Reds[numBuckets]);
                    }
                    else {
                        colors = colorbrewer.Reds[numBuckets];	// default color scheme
                    }
                } else {
                    let startColor: string = this.settings.general.gradientStart;
                    let endColor: string = this.settings.general.gradientEnd;
                    let colorScale: LinearColorScale = createLinearColorScale([0, numBuckets], [startColor, endColor], true);
                    colors = [];

                    for (let bucketIndex: number = 0; bucketIndex < numBuckets; bucketIndex++) {
                        colors.push(colorScale(bucketIndex));
                    }
                }

                let colorScale: Quantile<string> = d3.scale.quantile<string>()
                    .domain([minDataValue, maxDataValue])
                    .range(colors);

                let xAxisHeight: number = this.getXAxisHeight(chartData);
                let yAxisWidth: number = this.getYAxisWidth(chartData);
                let yAxisHeight: number = this.getYAxisHeight(chartData);

                if (!this.settings.yAxisLabels.show) {
                    yAxisWidth = 0;
                }

                if (!this.settings.xAxisLabels.show) {
                    xAxisHeight = 0;
                }

                let maxDataText: string = chartData.dataPoints[0].valueStr || "";
                chartData.dataPoints.forEach((value: TableHeatMapDataPoint) => {
                    if ((value.valueStr || "").length > maxDataText.length) {
                        maxDataText = value.valueStr || "";
                    }
                });

                let textProperties: TextProperties = {
                    fontSize: PixelConverter.toString(this.settings.labels.fontSize),
                    fontFamily: this.settings.labels.fontFamily,
                    text: maxDataText
                };
                let textRect: SVGRect = TextMeasurementService.measureSvgTextRect(textProperties);

                let gridSizeWidth: number = Math.floor((this.viewport.width - yAxisWidth) / (chartData.categoryX.length));
                let gridSizeHeight: number = gridSizeWidth * TableHeatMap.ConstGridHeightWidthRaito;

                if (gridSizeWidth < textRect.width) {
                    gridSizeWidth = textRect.width;
                }
                if (gridSizeHeight < textRect.height) {
                    gridSizeHeight = textRect.height;
                }

                let xOffset: number = this.margin.left + yAxisWidth; // add widht of y labels width
                let yOffset: number = this.margin.top + xAxisHeight; // todo add height of x categoru labels height

                const TableHeatMapCellRaito: number = 2 / 3;
                let legendElementWidth: number = (this.viewport.width * TableHeatMapCellRaito - xOffset) / numBuckets;
                let legendElementHeight: number = gridSizeHeight;

                if (this.settings.yAxisLabels.show) {
                    this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryYLabel)
                        .data(chartData.categoryY)
                        .enter().append(TableHeatMap.HtmlObjText)
                        .text((d: string) => {
                            return TableHeatMap.textLimit(d, this.settings.yAxisLabels.maxTextSymbol);
                        })
                        .attr(TableHeatMap.AttrDY, TableHeatMap.Const071em)
                        .attr(TableHeatMap.AttrX, this.margin.left)
                        .attr(TableHeatMap.AttrY, function (d, i) {
                            return i * gridSizeHeight - (gridSizeHeight / 2) + yOffset - yAxisHeight / 3;
                        })
                        .style(TableHeatMap.StTextAnchor, TableHeatMap.ConstBegin)
                        .style({
                            "font-size": this.settings.yAxisLabels.fontSize,
                            "font-family": this.settings.yAxisLabels.fontFamily,
                            "fill": this.settings.yAxisLabels.fill
                        })
                        .attr(TableHeatMap.AttrTransform, translate(TableHeatMap.ConstShiftLabelFromGrid, gridSizeHeight))
                        .classed(TableHeatMap.ClsCategoryYLabel, true)
                        .classed(TableHeatMap.ClsMono, true)
                        .classed(TableHeatMap.ClsAxis, true);

                    this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryYLabel)
                        .call(this.wrap, gridSizeWidth + xOffset);

                    this.truncateTextIfNeeded(this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryYLabel), gridSizeWidth + xOffset);
                }

                if (this.settings.xAxisLabels.show) {
                    this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryXLabel)
                        .data(chartData.categoryX)
                        .enter().append(TableHeatMap.HtmlObjText)
                        .text(function (d: string) {
                            return chartData.categoryValueFormatter.format(d);
                        })
                        .attr(TableHeatMap.AttrX, function (d: string, i: number) {
                            return i * gridSizeWidth + xOffset;
                        })
                        .attr(TableHeatMap.AttrY, xAxisHeight / 2)
                        .attr(TableHeatMap.AttrDY, TableHeatMap.Const0em)
                        .style(TableHeatMap.StTextAnchor, TableHeatMap.ConstMiddle)
                        .style({
                            "font-size": this.settings.xAxisLabels.fontSize,
                            "font-family": this.settings.xAxisLabels.fontFamily,
                            "fill": this.settings.xAxisLabels.fill
                        })
                        .classed(TableHeatMap.ClsCategoryXLabel + " " + TableHeatMap.ClsMono + " " + TableHeatMap.ClsAxis, true)
                        .attr(TableHeatMap.AttrTransform, translate(gridSizeHeight, TableHeatMap.ConstShiftLabelFromGrid));

                    this.truncateTextIfNeeded(this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryXLabel), gridSizeWidth);
                }

                let heatMap: d3.Selection<TableHeatMapDataPoint> = this.mainGraphics.selectAll("." + TableHeatMap.ClsCategoryX)
                    .data(chartData.dataPoints)
                    .enter()
                    .append(TableHeatMap.HtmlObjRect)
                    .attr(TableHeatMap.AttrX, function (d: TableHeatMapDataPoint) {
                        return chartData.categoryX.indexOf(d.categoryX) * gridSizeWidth + xOffset;
                    })
                    .attr(TableHeatMap.AttrY, function (d: TableHeatMapDataPoint) {
                        return chartData.categoryY.indexOf(d.categoryY) * gridSizeHeight + yOffset;
                    })
                    .classed(TableHeatMap.ClsCategoryX + " " + TableHeatMap.ClsBordered, true)
                    .attr(TableHeatMap.AttrWidth, gridSizeWidth)
                    .attr(TableHeatMap.AttrHeight, gridSizeHeight)
                    .style(TableHeatMap.StFill, colors[0]);


                if (chartData.categoryX.length * gridSizeWidth + xOffset > options.viewport.width) {
                    this.svg.attr({
                        width: chartData.categoryX.length * gridSizeWidth
                    });
                }

                // add data labels
                let textHeight: number = textRect.height;
                let textWidth: number = textRect.width;
                let heatMapDataLables: d3.Selection<TableHeatMapDataPoint> = this.mainGraphics.selectAll("." + TableHeatMap.CLsHeatMapDataLabels);

                let heatMapDataLablesData: d3.selection.Update<TableHeatMapDataPoint> = heatMapDataLables.data(this.settings.labels.show && textHeight <= gridSizeHeight && chartData.dataPoints);

                heatMapDataLablesData
                    .enter()
                    .append("text")
                    .classed(TableHeatMap.CLsHeatMapDataLabels, true)
                    .attr(TableHeatMap.AttrX, function (d: TableHeatMapDataPoint) {
                        return chartData.categoryX.indexOf(d.categoryX) * gridSizeWidth + xOffset + gridSizeWidth / 2;
                    })
                    .attr(TableHeatMap.AttrY, function (d: TableHeatMapDataPoint) {
                        return chartData.categoryY.indexOf(d.categoryY) * gridSizeHeight + yOffset + gridSizeHeight / 2 + textHeight / 2.6;
                    })
                    .style({
                        "text-anchor": TableHeatMap.ConstMiddle,
                        "font-size": this.settings.labels.fontSize,
                        "font-family": this.settings.labels.fontFamily,
                        "fill": this.settings.labels.fill
                    })
                    .text( (dataPoint: TableHeatMapDataPoint) => {
                        let textValue: string = (dataPoint.value || "null").toString();
                        textProperties.text = textValue;
                        textValue = TextMeasurementService.getTailoredTextOrDefault(textProperties, gridSizeWidth);
                        return textValue;
                    });

                heatMapDataLablesData.exit().remove();

                let elementAnimation: d3.Selection<D3Element> = <d3.Selection<D3Element>> this.getAnimationMode(heatMap, suppressAnimations);
                elementAnimation.style(TableHeatMap.StFill, function (d: any) {
                    return <string>colorScale(d.value);
                });

                this.tooltipServiceWrapper.addTooltip(heatMap, (tooltipEvent: TooltipEventArgs<TooltipEnabledDataPoint>) => {
                    return tooltipEvent.data.tooltipInfo;
                });

                // legend
                let legendDataValues = [0].concat(colorScale.quantiles());
                let legendData = legendDataValues.map((value, index) => {
                    return {
                        value: value,
                        tooltipInfo: [{
                            displayName: `Min value`,
                            value: value.toFixed(0)
                        },
                        {
                            displayName: `Max value`,
                            value: (legendDataValues[index + 1] || maxDataValue).toFixed(0)
                        }]
                    };
                });

                let legend: Update<any> = this.mainGraphics.selectAll("." + TableHeatMap.ClsLegend)
                    .data(legendData);

                legend.enter().append(TableHeatMap.HtmlObjG)
                    .classed(TableHeatMap.ClsLegend, true);

                let legendOffsetX: number = xOffset;
                let legendOffsetCellsY: number = this.margin.top + gridSizeHeight * (chartData.categoryY.length + TableHeatMap.ConstLegendOffsetFromChartByY) + xAxisHeight;
                let legendOffsetTextY: number = this.margin.top + gridSizeHeight * (chartData.categoryY.length + TableHeatMap.ConstLegendOffsetFromChartByY) + legendElementHeight * 2 + xAxisHeight;

                legend.append(TableHeatMap.HtmlObjRect)
                    .attr(TableHeatMap.AttrX, function (d, i) {
                        return legendElementWidth * i + legendOffsetX;
                    })
                    .attr(TableHeatMap.AttrY, legendOffsetCellsY)
                    .attr(TableHeatMap.AttrWidth, legendElementWidth)
                    .attr(TableHeatMap.AttrHeight, legendElementHeight)
                    .style(TableHeatMap.StFill, function (d, i) {
                        return colors[i];
                    })
                    .classed(TableHeatMap.ClsBordered, true);

                legend.append(TableHeatMap.HtmlObjText)
                    .classed(TableHeatMap.ClsMono, true)
                    .attr(TableHeatMap.AttrX, function (d, i) {
                        return legendElementWidth * i + legendOffsetX - legendElementWidth / 4;
                    })
                    .attr(TableHeatMap.AttrY, legendOffsetTextY)
                    .text(function (d) {
                        return chartData.valueFormatter.format(d.value);
                    });

                this.mainGraphics.select("." + TableHeatMap.ClsLegend)
                    .data([0].concat(maxDataValue))
                    .append(TableHeatMap.HtmlObjText)
                    .text(chartData.valueFormatter.format(maxDataValue))
                    .attr(TableHeatMap.AttrX, legendElementWidth * colors.length + legendOffsetX - legendElementWidth / 4)
                    .attr(TableHeatMap.AttrY, legendOffsetTextY)
                    .classed(TableHeatMap.ClsLegend, true)
                    .classed(TableHeatMap.ClsMono, true);

                this.tooltipServiceWrapper.addTooltip(legend, (tooltipEvent: TooltipEventArgs<TooltipEnabledDataPoint>) => {
                    return tooltipEvent.data.tooltipInfo;
                });
                legend.exit().remove();

                if (legendOffsetTextY > options.viewport.height) {
                    this.svg.attr({
                        height: legendOffsetTextY
                    });
                }
            }
        }

        private static textLimit(text: string, limit: number) {
            if (text.length > limit) {
                return ((text || "").substring(0, limit - 3).trim()) + "…" ;
            }

            return text;
        }

        private setSize(viewport: IViewport): void {
            let height: number,
                width: number;

            this.svg
                .attr(TableHeatMap.AttrHeight, Math.max(viewport.height, 0))
                .attr(TableHeatMap.AttrWidth, Math.max(viewport.width, 0));

            height =
                viewport.height -
                this.margin.top -
                this.margin.bottom;

            width =
                viewport.width -
                this.margin.left -
                this.margin.right;

            this.viewport = {
                height: height,
                width: width
            };

            this.mainGraphics
                .attr(TableHeatMap.AttrHeight, Math.max(this.viewport.height + this.margin.top, 0))
                .attr(TableHeatMap.AttrWidth, Math.max(this.viewport.width + this.margin.left, 0));

            this.mainGraphics.attr(TableHeatMap.AttrTransform, translate(this.margin.left, this.margin.top));
        }

        private truncateTextIfNeeded(text: d3.Selection<any>, width: number): void {
            text.call(LabelLayoutStrategy.clip,
                width,
                TextMeasurementService.svgEllipsis);
        }

        private wrap(text, width): void {
            text.each(function () {
                let text: d3.Selection<D3Element> = d3.select(this);
                let words: string[] = text.text().split(/\s+/).reverse();
                let word: string;
                let line: string[] = [];
                let lineNumber: number = 0;
                let lineHeight: number = 1.1; // ems
                let x: string = text.attr(TableHeatMap.AttrX);
                let y: string = text.attr(TableHeatMap.AttrY);
                let dy: number = parseFloat(text.attr(TableHeatMap.AttrDY));
                let tspan: d3.Selection<any> = text.text(null).append(TableHeatMap.HtmlObjTspan).attr(TableHeatMap.AttrX, x).attr(TableHeatMap.AttrY, y).attr(TableHeatMap.AttrDY, dy + "em");
                while (word = words.pop()) {
                    line.push(word);
                    tspan.text(line.join(" "));
                    let tspannode: any = tspan.node();  // Fixing Typescript error: Property 'getComputedTextLength' does not exist on type 'Element'.
                    if (tspannode.getComputedTextLength() > width) {
                        line.pop();
                        tspan.text(line.join(" "));
                        line = [word];
                        tspan = text.append(TableHeatMap.HtmlObjTspan).attr(TableHeatMap.AttrX, x).attr(TableHeatMap.AttrY, y).attr(TableHeatMap.AttrDY, ++lineNumber * lineHeight + dy + "em").text(word);
                    }
                }
            });
        }

        private getAnimationMode(element: D3Element, suppressAnimations: boolean): D3Element {
            if (suppressAnimations) {
                return element;
            }

            return (<d3.Selection<D3Element>> element)
                .transition().duration(this.animationDuration);
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            const settings: TableHeatmapSettings = this.dataView && this.settings
                || TableHeatmapSettings.getDefault() as TableHeatmapSettings;

            const instanceEnumeration: VisualObjectInstanceEnumeration =
                TableHeatmapSettings.enumerateObjectInstances(settings, options);

            return instanceEnumeration || [];
        }
    }
}


