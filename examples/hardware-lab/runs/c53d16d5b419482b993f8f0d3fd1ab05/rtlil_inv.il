autoidx 1
module \rtlil_inv
  wire input 1 \a
  wire output 2 \y
  cell $_NOT_ \g
    connect \A \a
    connect \Y \y
  end
end
