if (global.performance) {
  if (typeof global.performance.clearMeasures !== 'function') {
    global.performance.clearMeasures = () => {};
  }

  if (typeof global.performance.clearMarks !== 'function') {
    global.performance.clearMarks = () => {};
  }
}
