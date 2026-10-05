# Synthetic narrow ICC2 data grammar fixture, no vendor execution.
Technology {
 name = "synthetic"
 unitLengthName = "micron"
 unitCurrentName = "mA"
 gridResolution = 1000
}
Color 1 {
 name = "red"
 rgbDefined = 1
 redIntensity = 255
 greenIntensity = 10
 blueIntensity = 20
}
Layer "M1" {
 layerNumber = 13
 visible = 1
 selectable = 0
 color = "red"
 lineStyle = "solid"
 pattern = "blank"
 unitNomThickness = 0.03
 minSpacing = 0.05
}
ContactCode "V1" {
 layer1 = "M1"
 layer2 = "M2"
}
