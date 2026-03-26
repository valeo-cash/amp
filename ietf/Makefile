DRAFT = draft-valeo-amp-channel-00

.PHONY: all clean

all: $(DRAFT).html $(DRAFT).txt

$(DRAFT).html: $(DRAFT).xml
	xml2rfc --html $(DRAFT).xml

$(DRAFT).txt: $(DRAFT).xml
	xml2rfc --text $(DRAFT).xml

clean:
	rm -f $(DRAFT).html $(DRAFT).txt
