package org.entermediadb.utils;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.Reader;
import java.io.Writer;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.http.HttpResponse;
import org.apache.http.util.EntityUtils;

/**
 * Creation date: (9/11/2001 4:43:00 PM)
 * @author: CSB
 */
public class OutputFiller
{
	protected int fieldBufferSize = 2048;  //2048 Seems to be 4% faster than 1024 for larger files 
	protected long fieldMaxSize = -1;
	private static final Log log = LogFactory.getLog(OutputFiller.class);
	
	public long getMaxSize()
	{
		return fieldMaxSize;
	}

	public void setMaxSize(long inMaxSize)
	{
		fieldMaxSize = inMaxSize;
	}

	/**
	 * InputFlusher constructor comment.
	 */
	public OutputFiller()
	{
		super();
	}

	/**
	 * Creation date: (9/11/2001 4:55:34 PM)
	 * @param inBufferSize int
	 */
	public OutputFiller(int inBufferSize)
	{
		setBufferSize(inBufferSize);
	}

	public void fill(java.io.Reader in, java.io.Writer out) throws java.io.IOException
	{
		char[] bytes = new char[getBufferSize()];

		int iRead = -1;

		while (true)
		{
			iRead = in.read(bytes);

			if (iRead != -1)
			{
				out.write(bytes, 0, iRead);
			}
			else
			{
				break;
			}

		}
		out.flush();
	}

	public void fill(File inSource, File inOut) throws IOException
	{
		FileInputStream in = null;
		try
		{
			in = new FileInputStream(inSource);
			inOut.getParentFile().mkdirs();
			FileOutputStream out = new FileOutputStream(inOut);
			try
			{
				fill(in, out);
			}
			finally
			{
				safeClose(out);
			}
		}
		finally
		{
			safeClose(in);
		}
	}

	/**
	 * Creation date: (9/11/2001 4:53:38 PM)
	 * @return int
	 */
	public int getBufferSize()
	{
		return fieldBufferSize;
	}

	/**
	 * Creation date: (9/11/2001 4:53:38 PM)
	 * @param newBufferSize int
	 */
	public void setBufferSize(int newBufferSize)
	{
		fieldBufferSize = newBufferSize;
	}

	/**
	 * @param inResp 
	 * @param inIn
	 */
	public void consume(HttpResponse inResp)
	{
		try
		{
			EntityUtils.consume(inResp.getEntity());
		}
		catch (IOException e)
		{
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}
	
	public void close(InputStream inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			} catch (IOException ex)
			{
				//fail silently
			}
		}
	}
	public void close(OutputStream inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			} catch (IOException ex)
			{
				//fail silently
			}
		}
	}

	public static void safeClose(Reader inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			}
			catch (IOException ex)
			{
				log.error(ex);
			}
		}
	}
	public static void safeClose(InputStream inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			}
			catch (IOException ex)
			{
				log.error(ex);
			}
		}
	}
	public static void safeClose(OutputStream inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			}
			catch (IOException ex)
			{
				log.error(ex);
			}
		}
	}
	public static void safeClose(Writer inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			}
			catch (IOException ex)
			{
				log.error(ex);
			}
		}
	}
	
	public void close(Reader inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			} catch (IOException ex)
			{
				//fail silently
			}
		}
	}
	public void close(Writer inIn)
	{
		if ( inIn != null)
		{
			try
			{
				inIn.close();
			} catch (IOException ex)
			{
				//fail silently
			}
		}
	}
	
	
	
	public void fill(InputStream inIn, File inOutput) throws IOException
	{
		inOutput.getParentFile().mkdirs();
		FileOutputStream out = new FileOutputStream(inOutput);
		try
		{
			fill( inIn, out);
		}
		finally
		{
			close(out);
		}
	}
	public void fill(java.io.InputStream in, java.io.OutputStream out, boolean autoclose) throws java.io.IOException
	{
		fill(in,out);
		if( autoclose)
		{
			safeClose(in);
			safeClose(out);
		}
	}
	public void fill(java.io.InputStream in, java.io.OutputStream out) throws java.io.IOException
	{
		byte[] bytes = new byte[getBufferSize()];

		long totalread = 0;
		int iRead = -1;

		while (true)
		{
			iRead = in.read(bytes);

			if (iRead != -1)
			{
				out.write(bytes, 0, iRead);
				totalread = totalread + iRead;
			}
			else
			{
				break;
			}
			if( getMaxSize() > 0 && totalread > getMaxSize() )
			{
				break;
			}
		}
		out.flush();
	}

	public void fill(InputStream in, OutputStream out, long inToSend) throws IOException
	{
		byte[] bytes = new byte[getBufferSize()];

		int iRead = -1;
		long sentsofar = 0;
		while (true)
		{
			iRead = in.read(bytes);
			//10b - 5b, 5b + 1b
			if( iRead != -1 && iRead + sentsofar > inToSend)
			{
				//we have a problem, have to cut iRead down
				iRead = (int) (inToSend - sentsofar );
			}
			if (iRead != -1)
			{
				out.write(bytes, 0, iRead);
				sentsofar = sentsofar + iRead;
				if( sentsofar  == inToSend) //should never be >
				{
					break;
				}
			}
			else
			{
				break;
			}
		}
		out.flush();
	}
}