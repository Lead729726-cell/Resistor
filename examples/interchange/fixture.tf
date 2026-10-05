; Synthetic parser grammar fixture. Internal numbers deliberately differ from GDS.
layerDefinitions(
  techLayers(
    (metal1 100 M1)
    (poly 200 PO)
  )
  techPurposes((drawing 252 drw)(pin 251 pin))
  techLayerPurposePriorities((metal1 drawing)(metal1 pin)(poly drawing))
  techDisplays(
    (metal1 drawing metalRed t t t t t)
    (metal1 pin metalRed t nil t t t)
    (poly drawing polyGreen t t t t t)
  )
)
layerRules(streamLayers((metal1 17 0 t)(poly 8 0 t)))
constraintGroups((foundry spacings(minWidth("metal1" 0.05))))
include("$PDK_ROOT/unknown.il")
